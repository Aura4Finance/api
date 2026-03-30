import { webhookQueue } from "@/queues/webhook.queue";

async function clearQueue() {
  await webhookQueue.obliterate({ force: true });
  console.log("Queue cleared");
  await webhookQueue.close();
}

clearQueue();