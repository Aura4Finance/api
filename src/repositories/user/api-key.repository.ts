import { Service } from "typedi";
import db from "@/config/db-config";

@Service()
export class ApiKeyRepository {
  async generateApiKeys(
    liveApiKey: string,
    testApiKey: string,
    businessProfileId: string
  ) {
    await db.apiKey.create({
      data: {
        liveKey: liveApiKey,
        testKey: testApiKey,
        profile: {
          connect: {
            id: businessProfileId,
          },
        },
      },
    });
  }

  async findApiKeyByBusinessProfileId(businessProfileId: string) {
    return await db.apiKey.findFirst({
      where: {
        profileId: businessProfileId,
      },
    });
  }

  async deleteApiKeys(id: string) {
    await db.apiKey.delete({
      where: {
        id,
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
