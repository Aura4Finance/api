import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { UserService } from "@/services/user/user.service";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class ModeController {
  constructor(private readonly userService: UserService) {}

  async handleModeSwitch(req: RequestAuth, res: Response) {
    const userId = req.user.id;
    const isLive = req.user.businessProfile.isLive;

    const { message, payload } =
      await this.userService.handleBusinessModeChange(userId, isLive);

    res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
