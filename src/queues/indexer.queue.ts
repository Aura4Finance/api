import { Queue } from "bullmq";
import { redisConnection } from "@/config/redis-config";
import { Mode, Token } from "@/generated/prisma/enums";

export const SUI_INDEXER_QUEUE = "sui-indexer";

export const SuiJobs = {
    POLL_WALLET_CREATED: "poll-wallet-created",
    TRACK_PAYMENT_EVENT: "track-payment-event",
    TRACK_COIN_BALANCE: "track-coin-balance",
} as const;

export type SuiJobName = (typeof SuiJobs)[keyof typeof SuiJobs];

export interface PollWalletCreatedData {
    mode: Mode;
}

export interface TrackPaymentEventData {
    mode: Mode;
    walletId: string;
    transactionId: string;
    merchantAddress: string;
    spawnedAt: string;
}

export interface TrackCoinBalanceData {
    transactionId: string;
    txWallet: string;
    token: Token;
    mode: Mode,
    spawnedAt: string;
}

export type SuiJobData =
    | PollWalletCreatedData
    | TrackPaymentEventData
    | TrackCoinBalanceData;


export const suiIndexerQueue = new Queue<SuiJobData>(SUI_INDEXER_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
});

export async function initSuiAccountIndexerJob(data: TrackCoinBalanceData): Promise<void> {
    const { mode, transactionId, spawnedAt, txWallet } = data; 

    for (const token of Object.values(Token)) {
        if(mode === "test" && token !== "USDC") continue;
        const subJobId = `track-balance:${txWallet}:${Buffer.from(token).toString("base64")}`;
        if (!(await suiIndexerQueue.getJob(subJobId))) {
            await suiIndexerQueue.add(
                SuiJobs.TRACK_COIN_BALANCE,
                {
                    transactionId,
                    token,
                    spawnedAt,
                    mode,
                    txWallet
                } satisfies Partial<TrackCoinBalanceData>,
                {
                    jobId: subJobId,
                    attempts: 60,                          // 60 × 10 s = 10 min
                    backoff: { type: "fixed", delay: 10_000 },
                    removeOnComplete: true,
                    removeOnFail: false,
                },
            );
        }
    }

}


export async function initSuiWalletIndexerJob(mode: Mode): Promise<void> {
    const schedulerKey = `sui-wallet-indexer-scheduler-${mode}`;

    const existing = await suiIndexerQueue.getJobSchedulers();
    for (const s of existing) {
        if (s.key === schedulerKey) {
            await suiIndexerQueue.removeJobScheduler(schedulerKey);
        }
    }

    await suiIndexerQueue.upsertJobScheduler(
        schedulerKey,
        { every: 5_000 },
        {
            name: SuiJobs.POLL_WALLET_CREATED,
            data: { mode } satisfies PollWalletCreatedData,
            opts: { removeOnComplete: true, removeOnFail: false },
        },
    );
}