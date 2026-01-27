import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { OnboardUserDto } from "@/dto/user.dto";
import { UserService } from "@/services/user/user.service";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { onboardingSchemaValidation } from "@/validation/user.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class UserController {
  constructor(private readonly userService: UserService) {}

  async onboardUser(req: RequestAuth, res: Response) {
    const { error, value } = onboardingSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: OnboardUserDto = value as OnboardUserDto;
    const userId = req.user.id;

    const { payload, message } = await this.userService.onboarduser(body, userId);

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }
}
