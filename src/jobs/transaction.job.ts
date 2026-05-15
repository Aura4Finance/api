import { Worker } from "bullmq";
import db from "@/config/db-config";
import { TransactionStatus } from "../../generated/prisma";
import logger from "@/utils/logger";
import { PaymentService } from "@/services/payment.service";
import Container from "typedi";
import { redisConnection } from "@/config/redis-config";
import { WalletService } from "@/services/wallet.service";

export const startTransactionWorker = () => {
  const paymentService = Container.get(PaymentService);

  new Worker(
    "transaction-queue",
    async (job) => {
      if (job.name == "expire-pending-transactions") {

        logger.info("⏱ Transaction expiry job running");
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        try {
          const pending = await db.transaction.findMany({
            where: {
              status: TransactionStatus.PENDING,
              createdAt: { lte: cutoff },
            },
            select: { id: true },
          });

          for (const tx of pending) {
            try {
              // Try verifyPayment first
              await paymentService.verifyPayment({ paymentId: tx.id });
            } catch (error) {
              await db.transaction.update({
                where: { id: tx.id },
                data: { status: TransactionStatus.FAILED },
              });
              logger.info(`Transaction ${tx.id} expired and marked as failed`);
            }
          }
        } catch (error) {
          logger.error(`Transaction worker error: ${error}`);
          throw error;
        }
      }
      if (job.name == "transfer-usdt") {
        const {
          walletPrivateKey,
          coinObjectId,
          amount,
          toAddress,
          tokenType,
          mode
        } = job.data;
        const walletService = Container.get(WalletService);
        await walletService.splitSendToMerchantsAndAdmin(
          walletPrivateKey,
          coinObjectId,
          amount,
          toAddress,
          tokenType,
          mode
        )
      }
    },
    { connection: redisConnection }
  );

  logger.info("💸 Transaction Worker started");
};
