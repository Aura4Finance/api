import app from "./app"
import { initTransactionAndEmailOnboardJobs } from "./queues/init";
import logger from "./utils/logger";
import "reflect-metadata";


const PORT = process.env.PORT || 5000;

if(process.env.PROCESS_TYPE === "worker") {
  import("./jobs/email.job").then(({ startEmailWorker }) => {
    startEmailWorker();
  });

  import("./jobs/transaction.job").then(({ startTransactionWorker }) => {
    startTransactionWorker();
  });

  import("./jobs/webhook.job").then(({ startWebhookWorker }) => {
    startWebhookWorker();
  });

  import("./jobs/subscription.job").then(({ startSubscriptionWorker }) => {
    startSubscriptionWorker();
  })

} else {
  (async () => {
    try {
      logger.info("🚀 Starting server...");

      await initTransactionAndEmailOnboardJobs();

      app.listen(PORT, () => {
        logger.info(`Server is running on Port: ${PORT}`);
      });
    } catch (error) {
      logger.error("Failed to initialize server:", error);
      process.exit(1);
    }
  })();
}
