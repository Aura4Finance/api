import { Service } from "typedi";
import { ApiKeyService } from "../../services/user/api-key.service";
import { Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { RequestAuth } from "@/@types/request";
import { UserService } from "@/services/user/user.service";
import { rotateApiKeySchema } from "@/validation/key.validation";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { RotateApiKeyDto } from "@/dto/api-key.dto";

@Service()
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly userService: UserService
  ) {}
  private MAX_API_KEYS = 1; 
  async generateApiKeys(req: RequestAuth, res: Response) {
    const user = await this.userService.getUserById(req.user.id);

    const keys = await this.apiKeyService.getApiKeys(
      <string>user!.businessProfile?.id
    );
    if(keys.payload.length >= this.MAX_API_KEYS) {
      return res.status(STATUS.bad).json({
        success: false,
        message: "Maximum of 1 API keys allowed. Please regenerate or delete existing keys.",
      });
    }

    const { message, payload } = await this.apiKeyService.generateApiKeys(
      <string>user!.businessProfile?.id
    );

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async regenerateApiKeys(req: RequestAuth, res: Response) {
    const user = await this.userService.getUserById(req.user.id);
    const { value, error} = rotateApiKeySchema(req.body);

    if(error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body = value as RotateApiKeyDto
    const { message, payload } = await this.apiKeyService.regenerateApikeys(
      <string>user!.businessProfile?.id,
      body.keyId
    );

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getApiKeys(req: RequestAuth, res: Response) {
    const user = await this.userService.getUserById(req.user.id);

    const { message, payload } = await this.apiKeyService.getApiKeys(
      <string>user!.businessProfile?.id
    );
    payload.forEach((key: any) => key.liveKey = key.liveKey ? "lk_********************" + key.liveKey.slice(-4) : null);
    return res.status(STATUS.ok).json({
      success: true,
      message: message,
      data: payload,
    });
  }
}
