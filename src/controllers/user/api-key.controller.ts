import { Service } from "typedi";
import { ApiKeyService } from "../../services/user/api-key.service";
import { Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { RequestAuth } from "@/@types/request";
import { UserService } from "@/services/user/user.service";

@Service()
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly userService: UserService
  ) {}
  async generateApiKeys(req: RequestAuth, res: Response) {
    const user = await this.userService.getUserById(req.user.id);

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

    const { message, payload } = await this.apiKeyService.regenerateApikeys(
      <string>user!.businessProfile?.id
    );

    res.status(STATUS.created).json({
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
    return res.status(STATUS.ok).json({
      success: true,
      message: message,
      data: payload,
    });
  }
}
