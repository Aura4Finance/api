import { Service } from "typedi";
import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { UserService } from "@/services/user/user.service";
import { Metrics } from "@/services/metrics.service";
import { ChangeEmailDto, VerifyEmailChangeDto } from "@/dto/user.dto";
import {
  changeEmailSchemaValidation,
  verifyEmailChangeSchemaValidation,
} from "@/validation/user.validation";
import sanitizeUser from "@/utils/sanitize-user";

@Service()
export class ProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly metricsService: Metrics
  ) { }

  async getProfile(req: RequestAuth, res: Response) {
    const profile = req.user;
    const safeProfile = sanitizeUser(profile);

    return res.status(STATUS.ok).json({
      success: true,
      message: "User profile retrived successfully!",
      data: safeProfile
    });
  }

  async getProfileMetrics(req: RequestAuth, res: Response) {
    const profile = req.user;
    const { message, payload } = await this.metricsService.getMerchantDashboardMetrics(
      <string>profile?.businessProfile?.id,
      profile?.businessProfile?.isLive ? "live" : "test");

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    });
  }

  async changeEmail(req: RequestAuth, res: Response) {
    const { error, value } = changeEmailSchemaValidation(req.body);
    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
        data: null,
      });
    }
    const body: ChangeEmailDto = value as ChangeEmailDto;
    const user = req.user;
    if (user.email === body.email) {
      return res.status(STATUS.conflict).json({
        success: false,
        message: "Email is already linked to this account"
      })
    }
    await this.userService.changeEmail(user.id, user.email);

    return res.status(STATUS.ok).json({
      success: true,
      message: "Email change initialised - Check email for OTP",
      data: null,
    });
  }

  async verifyEmailChange(req: RequestAuth, res: Response) {
    const { error, value } = verifyEmailChangeSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
        data: null,
      });
    }

    const body: VerifyEmailChangeDto = value as VerifyEmailChangeDto;
    const userId = req.user.id;
    const userEmail = req.user.email;
    await this.userService.verifyEmailChange(userId, userEmail, body);

    return res.status(STATUS.ok).json({
      success: true,
      message: "Email changed successfully",
      data: null,
    });
  }
}
