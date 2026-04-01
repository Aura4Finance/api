import { webhookQueue } from "@/queues/webhook.queue";

async function clearQueue() {
  await webhookQueue.drain(true);
  await webhookQueue.clean(0, 1000, "wait");
  await webhookQueue.clean(0, 1000, "active");
  await webhookQueue.clean(0, 1000, "delayed");
  await webhookQueue.clean(0, 1000, "completed");
  await webhookQueue.clean(0, 1000, "failed");
  await webhookQueue.clean(0, 1000, "paused");
  await webhookQueue.obliterate({ force: true });

  console.log("BullMQ queue fully cleared");

  await webhookQueue.close();
}

clearQueue();