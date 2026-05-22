import { Service } from "typedi";
import db from "@/config/db-config";

@Service()
export class ApiKeyRepository {
  async generateApiKeys(
    liveApiKey: string,
    testApiKey: string,
    userId: string,
  ) {
    await db.apiKey.create({
      data: {
        liveKey: liveApiKey,
        testKey: testApiKey,
        profile: {
          connect: {
            userId,
          },
        },
      },
    });
  }

  async findApiKeyByUserId(userId: string) {
    return await db.apiKey.findMany({
      where: {
        profile: {
          userId
        },
      },
    });
  }

  async deleteApiKeys(id: string, userId: string) {
    await db.apiKey.delete({
      where: {
        id,
        profile: {
          userId
        }
      },
    });
  }

  async findByKey(key: string) {
    return await db.apiKey.findFirst({
      where: {
        OR: [{ liveKey: key }, { testKey: key }],
      },
      include: {
        profile: true,
      }
    });
  }

  async updateLastUsed(id: string) {
    await db.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

}
