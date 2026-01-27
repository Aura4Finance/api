import { Service } from "typedi";
import { AuthService } from "../services/auth.service";
import { Request, Response } from "express";
import {
  AuthCodeDto,
  CreateAccountDto,
  LoginDto,
  OTPDto,
  ResendOtpDto,
  ResetPasswordDto,
} from "../dto/auth.dto";
import { STATUS } from "../constants/status.constant";
import {
  createAccountValidation,
  loginSchemaValidation,
  exchangeCodeForAccessTokenValidation,
  otpSchemaValidation,
  resendOtpSchemaValidation,
  resetPasswordSchemaValidation,
} from "../validation/auth.validation";
import { formatErrorValidation } from "../utils/format-validation-error";
import { RequestAuth } from "@/@types/request";

@Service()
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  async register(req: Request, res: Response) {
    const { error, value } = createAccountValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: CreateAccountDto = value as CreateAccountDto;

    const { payload, message } = await this.authService.registerUser(body);

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async verifyEmail(req: Request, res: Response) {
    const { error, value } = otpSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        error: formatErrorValidation(error),
      });
    }

    const body: OTPDto = value as OTPDto;

    const { payload, message } = await this.authService.verifyEmail(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async resendOtp(req: Request, res: Response) {
    const { error, value } = resendOtpSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: ResendOtpDto = value;

    const { payload, message } = await this.authService.resendOtp(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async signIn(req: Request, res: Response) {
    const { error, value } = loginSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: LoginDto = value as LoginDto;

    const { payload, message } = await this.authService.signIn(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: {
        code: payload.otp,
      },
    });
  }

  async signOut(req: RequestAuth, res: Response) {
    const { jti, exp } = req;
    const { payload, message } = await this.authService.signOut(jti as string, exp as number);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    });
  }

  async exchangeCode(req: Request, res: Response) {
    const { error, value } = exchangeCodeForAccessTokenValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }
    const body: AuthCodeDto = value;
    const { payload, message } = await this.authService.exchangeCodeForAccessToken(body);
    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload.accessToken
    });
  }

  async forgotPassword(req: Request, res: Response) {
    const { error, value } = resendOtpSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: ResendOtpDto = value;

    const { payload, message } = await this.authService.forgotPassword(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async resetPassword(req: Request, res: Response) {
    const { error, value } = resetPasswordSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: ResetPasswordDto = value;

    const { payload, message } = await this.authService.resetPassword(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }
}
