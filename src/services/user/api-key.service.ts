import { Service } from "typedi";
import crypto from "crypto";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { ApiKeyRepository } from "@/repositories/user/api-key.repository";

@Service()
export class ApiKeyService {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async generateApiKeys(businessProfileId: string, f = false) {
    const liveApiKey = crypto.randomBytes(32).toString("hex");
    const testApiKey = crypto.randomBytes(32).toString("hex");
    this.apiKeyRepository.generateApiKeys(
      !f ? `lk_${liveApiKey}` : "",
      `tk_${testApiKey}`,
      businessProfileId
    );

    return {
      message: "API keys generated successfully",
      payload: {
        liveKey: !f ? `lk_${liveApiKey}` : "",
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
    if (!keys.length) {
      await this.generateApiKeys(businessProfileId, true);
    }

    return {
      message: "API keys retrieved successfully",
      payload: keys,
    };
  }

  async validateApiKey(key: string) {
    const apiKey = await this.apiKeyRepository.findByKey(key);

    if (!apiKey) {
      throw new APIError("API key is invalid.", STATUS.unauthorized);
    }

    await this.apiKeyRepository.updateLastUsed(apiKey.id);

    const mode = apiKey.liveKey === key ? "live" : "test";

    return { ...apiKey, mode };
  }
}
