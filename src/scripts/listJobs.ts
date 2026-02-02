import { Queue } from "bullmq";
import { redisConnection as connection } from "../config/redis-config";

const QUEUE_NAME = "my-queue"; // 🔁 change this

async function listJobs() {
  const queue = new Queue(QUEUE_NAME, { connection });

  const states: any[] = ["waiting", "active", "delayed", "failed", "completed"];

  for (const state of states) {
    const jobs = await queue.getJobs([state], 0, 1000);

    if (jobs.length === 0) continue;

    console.log(`\n📦 ${state.toUpperCase()} JOBS (${jobs.length})`);
    console.log("=".repeat(40));

    for (const job of jobs) {
      console.log({
        id: job.id,
        name: job.name,
        state,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason ?? null,
      });
    }
  }

  await queue.close();
}

listJobs()
  .then(() => {
    console.log("\n✅ Done listing jobs");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
