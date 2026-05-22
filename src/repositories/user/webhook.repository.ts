import db from "@/config/db-config";
import { Service } from "typedi";

@Service()
export class WebhookRepository {
  async findWebhookByProfileId(profileId: string) {
    return await db.webhook.findFirst({
      where: {
        profileId
      },
    });
  }

  async createWebhook(profileId: string, secret: string, url: string) {
    return await db.webhook.create({
      data: {
        url,
        secret,
        profile: {
          connect: {
            id: profileId,
          },
        },
      },
    });
  }

  async updateWebhook(profileId: string, url: string) {
    return await db.webhook.update({
      where: {
        profileId,
      },
      data: {
        url,
      },
    });
  }

  async addEventToWebhook(event: string, webhookId: string) {
    await db.webhook.update({
      where: {
        id: webhookId,
      },
      data: {
        events: {
          push: event,
        },
      },
    });
  }
}
