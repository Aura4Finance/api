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
    PollWalletCreatedData,
    TrackPaymentEventData,
    TrackCoinBalanceData,
    suiIndexerQueue,
} from "@/queues/indexer.queue";
import { Mode, Token } from "@/generated/prisma/client";
import { TatumRpcClient } from "@/services/tatum.service";
import { WebhookQueue } from "@/services/schedule.webhook.service";

const keys = {
    walletCursor: (mode: string) => `sui:cursor:wallet:${mode}`,
    paymentCursor: (walletId: string) => `sui:cursor:payment:${walletId}`,
    resolved: (walletId: string) => `sui:resolved:${walletId}`,
};

const TTL_MS = 10 * 60 * 1000; // 10 minutes


async function handlePollWalletCreated(
    data: PollWalletCreatedData,
    paymentRepo: PaymentRepository,
    tatumRpcClient: TatumRpcClient
) {
    const { mode } = data;
    const network = mode === "live" ? "mainnet" : "testnet";
    const packageId = getSmartContractId(network)!;
    const MoveEventType = `${packageId}::main::WalletCreated`;

    const raw = await redisClient.get(keys.walletCursor(mode));
    const cursor = raw ? JSON.parse(raw) : null;

    const result = await tatumRpcClient.queryEvents({
        filter: {
            MoveEventType
        },
        mode,
        cursor,
        limit: 50,
        descending: false,
    });

    for (const event of result.data) {
        const walletData = event.parsedJson as {
            wallet_id: string;
            merchant: string;
            amount: string;
            transaction_id: string;
        };

        const tx = await paymentRepo.findPaymentById(
            walletData.transaction_id,
            mode as Mode,
            walletData.merchant,
        );

        if (!tx) {
            logger.warn(`[WalletIndexer] Tx ${walletData.transaction_id} not found – skipping`);
            continue;
        }

        // Resolve token type from wallet object generic param
        const obj = await tatumRpcClient.getObject({
            objectId: walletData.wallet_id,
            mode
        });

        if (!obj.error) {
            const match = obj.type.match(/<([^>]+)>/);
            if (!match?.[1]) {
                logger.warn(`[WalletIndexer] Cannot parse type for wallet ${walletData.wallet_id}`);
                continue;
            }

            const parts = match[1].split("::");
            const token = parts[parts.length - 1] as Token;

            await paymentRepo.addDepositAddressToPayment(tx.id, walletData.wallet_id, token);
        }
        logger.info(`[WalletIndexer] Wallet ${walletData.wallet_id} linked to tx ${tx.id}`);

        // Spawn payment-event tracker (dedup by walletId)
        const jobId = `track-payment:${walletData.wallet_id}`;
        if (!(await suiIndexerQueue.getJob(jobId))) {
            await suiIndexerQueue.add(
                SuiJobs.TRACK_PAYMENT_EVENT,
                {
                    mode,
                    walletId: walletData.wallet_id,
                    transactionId: walletData.transaction_id,
                    merchantAddress: walletData.merchant,
                    spawnedAt: new Date().toISOString(),
                } satisfies TrackPaymentEventData,
                {
                    jobId,
                    attempts: 120,                         // 120 × 5 s = 10 min
                    backoff: { type: "fixed", delay: 5_000 },
                    removeOnComplete: true,
                    removeOnFail: false,
                },
            );
        }
    }

    if (result.nextCursor) {
        await redisClient.set(keys.walletCursor(mode), JSON.stringify(result.nextCursor));
    }
}


async function handleTrackPaymentEvent(
    data: TrackPaymentEventData,
    paymentRepo: PaymentRepository,
    paymentService: PaymentService,
    tatumRpcClient: TatumRpcClient,
    webhookQueue: WebhookQueue
) {
    const { mode, walletId, transactionId, merchantAddress, spawnedAt } = data;

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
        const nowMs = Date.now();
        const result = await tatumRpcClient.queryEvents({
            filter: {
                MoveEventType,
                TimeRange: {
                    startTime: String(spawnedAtMs),
                    endTime: String(nowMs)
                },
            },
            cursor,
            limit: 50,
            mode,
            descending: false,
        });

        for (const event of result.data) {
            const p = event.parsedJson as {
                wallet_id: string;
                merchant: string;
                input_amount: string;
                usdc_distributed: string;
                fee_collected: string;
            };

            if (p.wallet_id !== walletId) continue;

            const tx = await paymentRepo.findPaymentById(transactionId, mode as Mode, merchantAddress);
            if (tx) {
                await paymentService.confirmPayment(tx);
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
            }
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
                case SuiJobs.POLL_WALLET_CREATED:
                    return handlePollWalletCreated(job.data as PollWalletCreatedData, paymentRepo, tatumRpcClient);

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
