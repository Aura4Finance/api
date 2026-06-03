import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { UserService } from "@/services/user/user.service";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class ModeController {
  constructor(private readonly userService: UserService) {}

  async handleModeSwitch(req: RequestAuth, res: Response) {
    const isOnboarded = req.user.businessProfile.onboarded;
    const isLive = req.user.businessProfile.isLive;
    const userId = req.user.id;

    const { message, payload } =
      await this.userService.handleBusinessModeChange(userId, isOnboarded, isLive);

    res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
