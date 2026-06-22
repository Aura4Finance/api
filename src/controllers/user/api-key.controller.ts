import { Service } from "typedi";
import { ApiKeyService } from "@/services/user/api-key.service";
import { Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { RequestAuth } from "@/@types/request";
import { rotateApiKeySchema } from "@/validation/key.validation";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { RotateApiKeyDto } from "@/dto/api-key.dto";

@Service()
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
  ) {}
  private MAX_API_KEYS = 1; 
  async generateApiKeys(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    if(req.mode !== "live") {
      return res.status(STATUS.bad).json({
        success: false,
        message: "API key generation is only available in live mode.",
      });
    }

    const keys = await this.apiKeyService.getApiKeys(userId);
    if(keys.payload.length >= this.MAX_API_KEYS) {
      return res.status(STATUS.bad).json({
        success: false,
        message: "Only 1 API key is allowed. Regenerate or delete the existing key.",
      });
    }

    const { message, payload } = await this.apiKeyService.generateApiKeys(userId);

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async regenerateApiKeys(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    if(req.mode !== "live") {
      return res.status(STATUS.bad).json({
        success: false,
        message: "API key regeneration is only available in live mode.",
      });
    }
    const { value, error} = rotateApiKeySchema(req.body);

    if(error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body = value as RotateApiKeyDto
    const { message, payload } = await this.apiKeyService.regenerateApikeys(
      userId,
      body.keyId
    );

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getApiKeys(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const { message, payload } = await this.apiKeyService.getApiKeys(userId);
    payload.forEach((key: any) => key.liveKey = key.liveKey ? "lk_********************" + key.liveKey.slice(-4) : null);
    return res.status(STATUS.ok).json({
      success: true,
      message: message,
      data: payload,
    });
  }
}
