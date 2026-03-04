import { Service } from "typedi";
import crypto from "crypto";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { ApiKeyRepository } from "@/repositories/user/api-key.repository";

@Service()
export class ApiKeyService {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async generateApiKeys(businessProfileId: string) {
    const liveApiKey = crypto.randomBytes(32).toString("hex");
    const testApiKey = crypto.randomBytes(32).toString("hex");
    this.apiKeyRepository.generateApiKeys(
      `lk_${liveApiKey}`,
      `tk_${testApiKey}`,
      businessProfileId
    );

    return {
      message: "API keys generated successfully",
      payload: {
        liveKey: `lk_${liveApiKey}`,
        testKey: `tk_${testApiKey}`,
      },
    };
  }

  async regenerateApikeys(businessProfileId: string, keyId: string) {
    const apiKeys = await this.apiKeyRepository.findApiKeyByBusinessProfileId(
      businessProfileId
    );

    if (!apiKeys) {
      return await this.generateApiKeys(businessProfileId);
    }

    await this.apiKeyRepository.deleteApiKeys(keyId);

    return await this.generateApiKeys(businessProfileId);
  }

  async getApiKeys(businessProfileId: string) {
    const keys = await this.apiKeyRepository.findApiKeyByBusinessProfileId(
      businessProfileId
    );
    if (!keys) {
      throw new APIError("No API key found", STATUS.notFound);
    }

    return {
      message: "API keys retrieved successfully",
      payload: keys,
    };
  }

  async validateApiKey(key: string) {
    const apiKey = await this.apiKeyRepository.findByKey(key);

    if (!apiKey) {
      throw new APIError("Invalid API Key", STATUS.unauthorized);
    }

    await this.apiKeyRepository.updateLastUsed(apiKey.id);

    const mode = apiKey.liveKey === key ? "live" : "test";

    return { ...apiKey, mode };
  }
}
