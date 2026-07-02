import { Queue } from "bullmq";
import { redisConnection } from "@/config/redis-config";
import { Mode, Token } from "@/generated/prisma/enums";

export const SUI_INDEXER_QUEUE = "sui-indexer";

export const SuiJobs = {
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
    spawnedAt: string;
}

export interface TrackCoinBalanceData {
    transactionId: string;
    txWallet: string;
    mode: Mode;
    token: Token;
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

export async function initSuiAccountIndexerJob(data: Omit<TrackCoinBalanceData, "token">): Promise<void> {
    const { mode, transactionId, spawnedAt, txWallet } = data; 

    for (const token of Object.values(Token)) {
        if(mode === "test" && token !== "USDC") continue;
        const subJobId = `track-balance-${txWallet}:${Buffer.from(token).toString("base64")}`;
        if (!(await suiIndexerQueue.getJob(subJobId))) {
            await suiIndexerQueue.add(
                SuiJobs.TRACK_COIN_BALANCE,
                {
                    transactionId,
                    token,
                    spawnedAt,
                    mode,
                    txWallet
                },
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


export async function initSuiWalletIndexerJob(data: TrackPaymentEventData): Promise<void> {
    const { mode, transactionId, spawnedAt, txWallet } = data;
    const jobId = `track-wallet-object:${txWallet}`;
            await suiIndexerQueue.add(
                SuiJobs.TRACK_PAYMENT_EVENT,
                {
                    mode,
                    walletId: walletData.wallet_id,
                    transactionId: walletData.transaction_id,
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
