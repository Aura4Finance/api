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

} else {
  logger.info("🚀 Starting server...");
  app.listen(PORT, async () => {
    await initTransactionAndEmailOnboardJobs();
    logger.info(`Server is running on Port: ${PORT}`);
  });
}
