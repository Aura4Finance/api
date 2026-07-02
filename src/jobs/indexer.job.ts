import { Worker, Job } from "bullmq";
import { redisConnection, redisClient } from "@/config/redis-config";
import { getSmartContractId } from "@/constants/networks.constant";
import { PaymentService } from "@/services/payment.service";
import { PaymentRepository } from "@/repositories/payment.repository";
import { Container } from "typedi";
import logger from "@/utils/logger";
import {
    SUI_INDEXER_QUEUE,
    SuiJobs,
    SuiJobData,
    TrackPaymentEventData,
    TrackCoinBalanceData,
    suiIndexerQueue,
} from "@/queues/indexer.queue";
import { Mode, Token } from "@/generated/prisma/client";
import { TatumRpcClient } from "@/services/tatum.service";
import { WebhookQueue } from "@/services/schedule.webhook.service";
import { jobs, transactionQueue } from "@/queues/transaction.queue";

const keys = {
    walletCursor: (mode: string) => `sui:cursor:wallet:${mode}`,
    paymentCursor: (walletId: string) => `sui:cursor:payment:${walletId}`,
    resolved: (walletId: string) => `sui:resolved:${walletId}`,
};

const TTL_MS = 10 * 60 * 1000; // 10 minutes

async function triggerPostPaymentQueues(
    tx: Awaited<ReturnType<PaymentRepository["findPaymentById"]>>,
    webhookQueue: WebhookQueue,
) {
    if (!tx) return;

    // 1) Always emit payment success webhook
    await webhookQueue.addScheduler(tx.profileId, {
        event: "payment.success",
        data: {
            transactionId: tx.id,
            amount: tx.amount,
            currency: tx.currency,
            status: "success",
            occuredAt: new Date().toISOString(),
        },
    });

    // 2) If linked to subscription, enqueue initial-subscription post-processing
    const subscriptionId = tx.payment?.subscriptionId;
    if (subscriptionId) {
        await transactionQueue.add(
            jobs.VERIFY_INITIAL_SUBSCRIPTION_PAYMENT,
            {
                paymentId: tx.id,
                subscriptionId,
                failureEmailTemplate: "abandoned",
            },
            {
                removeOnComplete: true,
                removeOnFail: false,
                jobId: `verify-initial-subscription-payment_${subscriptionId}`,
            },
        );
    }
}


async function handleTrackPaymentEvent(
    data: TrackPaymentEventData,
    paymentRepo: PaymentRepository,
    paymentService: PaymentService,
    tatumRpcClient: TatumRpcClient,
    webhookQueue: WebhookQueue
) {
    const { mode, walletId, transactionId, spawnedAt } = data;

    // TTL guard
    if (Date.now() - new Date(spawnedAt).getTime() >= TTL_MS) {
        logger.warn(`[PaymentTracker] TTL expired for wallet ${walletId}`);
        await redisClient.del(keys.paymentCursor(walletId));
        return;
    }

    // Sibling balance-tracker already resolved this
    if (await redisClient.get(keys.resolved(walletId))) {
        logger.info(`[PaymentTracker] Wallet ${walletId} resolved by balance tracker – stopping`);
        await redisClient.del(keys.paymentCursor(walletId));
        return;
    }

    const network = mode === "live" ? "mainnet" : "testnet";
    const packageId = getSmartContractId(network)!;
    const MoveEventType = `${packageId}::main::PaymentProcessed`;

    const raw = await redisClient.get(keys.paymentCursor(walletId));
    const cursor = raw ? JSON.parse(raw) : null;

    const spawnedAtMs = new Date(spawnedAt).getTime();
    const deadlineMs = spawnedAtMs + TTL_MS;

    while (Date.now() < deadlineMs) {
        const result = await tatumRpcClient.queryEvents({
            filter: { MoveEventType },
            cursor,
            limit: 50,
            mode,
            descending: false,
        });
        for (const event of result.data) {
            if (Number(event.timestampMs) < spawnedAtMs) continue;

            const p = event.parsedJson as {
                wallet_id: string;
                merchant: string;
                input_amount: string;
                usdc_distributed: string;
                fee_collected: string;
            };

            if (p.wallet_id !== walletId) continue;

            const tx = await paymentRepo.findPaymentById(transactionId, mode);
            if (tx) {
                await paymentService.confirmPayment(tx);
                await triggerPostPaymentQueues(tx, webhookQueue);
                await redisClient.set(keys.resolved(walletId), "1", "EX", 700);
                await redisClient.del(keys.paymentCursor(walletId));
                logger.info(`[PaymentTracker] Confirmed via on-chain event for wallet ${walletId}`);
                return;
        }

        if (result.nextCursor) {
            await redisClient.set(keys.paymentCursor(walletId), JSON.stringify(result.nextCursor));
        }
    }

    throw new Error(`PaymentProcessed not yet seen for wallet ${walletId}`);
}
}

async function handleTrackCoinBalance(
    data: TrackCoinBalanceData,
    paymentService: PaymentService,
    paymentRepo: PaymentRepository,
    webhookQueue: WebhookQueue
) {
    const { transactionId, token, spawnedAt } = data;

    // TTL guard
    if (Date.now() - new Date(spawnedAt).getTime() >= TTL_MS) {
        logger.warn(`[BalanceTracker] TTL expired`);
        return;
    }
    await paymentService.verifyTransfer({ paymentId: transactionId, token });
    const tx = await paymentRepo.findPaymentById(transactionId);
    if (!tx) return;

    await triggerPostPaymentQueues(tx, webhookQueue);

    logger.info(`[BalanceTracker] Payment confirmed tx=${transactionId}`);
}



export function startSuiIndexerWorker(): Worker {
    const paymentRepo = Container.get(PaymentRepository);
    const paymentService = Container.get(PaymentService);
    const tatumRpcClient = Container.get(TatumRpcClient);
    const webhookQueue = Container.get(WebhookQueue);

    const worker = new Worker<SuiJobData>(
        SUI_INDEXER_QUEUE,
        async (job: Job<SuiJobData>) => {
            switch (job.name as (typeof SuiJobs)[keyof typeof SuiJobs]) {
                case SuiJobs.TRACK_PAYMENT_EVENT:
                    return handleTrackPaymentEvent(job.data as TrackPaymentEventData, paymentRepo, paymentService, tatumRpcClient, webhookQueue);

                case SuiJobs.TRACK_COIN_BALANCE:
                    return handleTrackCoinBalance(job.data as TrackCoinBalanceData, paymentService, paymentRepo, webhookQueue);

                default:
                    logger.warn(`[SuiIndexer] Unknown job name: ${job.name}`);
            }
        },
        {
            connection: redisConnection,
            concurrency: 20,
        },
    );

    worker.on("failed", (job, err) => {
        // Suppress expected retry noise
        const isRetryNoise =
            err.message.startsWith("Balance ") ||
            err.message.startsWith("PaymentProcessed not yet");
        if (!isRetryNoise) {
            logger.error(`[SuiIndexer] Job ${job?.id} (${job?.name}) hard-failed: ${err.message}`, err);
        }
    });

    return worker;
}
