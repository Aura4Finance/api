import { STATUS } from "@/constants/status.constant";
import { OnboardUserDto, VerifyEmailChangeDto } from "@/dto/user.dto";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import crypto from "crypto";
import { AuthRepository } from "@/repositories/auth.repository";
import { EmailService } from "../email.service";
import { resend, segments } from "@/config/resend-config";
import { redisClient } from "@/config/redis-config";
import speakeasy from "speakeasy";
import logger from "@/utils/logger";

@Service()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService
  ) { }

  async onboarduser(data: OnboardUserDto, user: any) {
    if (user.businessProfile.onboarded) {
      throw new APIError("Your account is already onboarded.", STATUS.conflict);
    }

    await this.userRepository.onboardUser(user.id, data);

    try{

      const { data: contact } = await resend.contacts.create({
        email: <string>user?.email,
        firstName: <string>user?.firstname,
        lastName: <string>user?.lastname,
        unsubscribed: false,
      });
  
      if (!contact) {
        logger.info(`Adding merchant to resend failed. Merchant Id: ${user?.id}`);
      }
      await resend.contacts.segments.add({
        contactId: <string>contact?.id,
        segmentId: segments.merchant.id
      })
    }catch(error: unknown){
      logger.info(`Adding merchant to resend failed. Merchant Id: ${user?.id}`);
    }

    return {
      message: "User onboarded successfully",
      payload: null,
    };
  }

  async changeEmail(userId: string, email: string) {
    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const otp = await this.authRepository.registerOtp(userId, otpSecret);

    await this.emailService.sendOtp(email, otp.secret);
  }

  async verifyEmailChange(userEmail: string, userId: string, body: VerifyEmailChangeDto) {
    const { email, otp } = body;
    const existingOtp = await this.authRepository.findOtpByEmail(userEmail);

    if (existingOtp?.secret != otp || existingOtp.expiresAt < new Date()) {
      throw new APIError("Invalid or expired OTP.", STATUS.bad);
    }

    await this.userRepository.changeEmail(userId, email);
  }

  async handleBusinessModeChange(userId: string, isOnboarded: boolean, isLive: boolean) {

    if (!isLive) {
      if (!isOnboarded) {
        throw new APIError("Please complete onboarding before switching to live mode.", STATUS.bad)
      }
    }
    await this.userRepository.changeBusinessMode(userId, isLive);

    return {
      message: "Mode Changed Successfully",
      payload: null,
    };
  }

  async setup2FA(userId: string) {
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `ORAFI (${userId})`
    });

    await redisClient.set(userId, secret.base32, "EX", 300); // Store secret in Redis with 5 minutes expiration

    return {
      message: "2FA secret generated successfully",
      payload: {
        otpauth_url: secret.otpauth_url,
        manualCode: secret.base32
      }
    };
  }

  async verify2FA(userId: string, token: string) {
    const secret = await redisClient.get(userId);
    if (!secret) {
      throw new APIError("2FA setup expired. Please start again.", STATUS.bad);
    }
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1
    });
    if (!verified) {
      throw new APIError("Invalid 2FA token. Please try again.", STATUS.bad);
    }
    await this.userRepository.findUserByIdAndUpdate2FA(userId, secret);

    await redisClient.del(userId);
    return {
      message: "2FA verified successfully",
      payload: null,
    }
  }
}
