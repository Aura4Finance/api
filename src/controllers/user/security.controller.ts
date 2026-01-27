import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { SecurityService } from "@/services/user/security.service";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { changePasswordValidation } from "@/validation/security.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  async changePassword(req: RequestAuth, res: Response) {
    const userId = req.user.id;
    const { error, value } = changePasswordValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
        data: null,
      });
    }

    const { message, payload } = await this.securityService.verifyPassword(
      userId,
      value.password
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async completePasswordChange(req: RequestAuth, res: Response) {
    const userId = req.user.id;
    const { error, value } = changePasswordValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
        data: null,
      });
    }

    const { message, payload } = await this.securityService.completePasswordChange(
      userId,
      value.password
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
