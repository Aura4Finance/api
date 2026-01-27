import { STATUS } from "@/constants/status.constant";
import { OnboardUserDto, VerifyEmailChangeDto } from "@/dto/user.dto";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import crypto from "crypto";
import { AuthRepository } from "@/repositories/auth.repository";
import { EmailService } from "../email.service";
import { resend } from "@/config/resend-config";

@Service()    
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService
  ) {}

  async onboarduser(data: OnboardUserDto, userId: string) {
    const user = await this.userRepository.findUserById(userId);

    if (user?.businessProfile?.onboarded) {
      throw new APIError("User already onboarded", STATUS.conflict);
    }

    await this.userRepository.onboardUser(user!.id, data);

    await resend.contacts.create({
      email: <string>user?.email,
      firstName: <string>user?.firstname,
      lastName: <string>user?.lastname,
      unsubscribed: false,
    });

    return {
      message: "User onboarded successfully",
      payload: null,
    };
  }

  async getUserById(userId: string) {
    const user = await this.userRepository.findUserById(userId);
    return user;
  }

  async changeEmail(userId: string, email: string) {
    const user = await this.getUserById(userId);

    if (user!.email === email) {
      throw new APIError(
        "Email already linked to this account",
        STATUS.conflict
      );
    }

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const otp = await this.authRepository.registerOtp(user!.id, otpSecret);

    await this.emailService.sendOtp(email, otp.secret);
  }

  async verifyEmailChange(userId: string, body: VerifyEmailChangeDto) {
    const { email, otp } = body;

    const user = await this.getUserById(userId);

    const existingOtp = await this.authRepository.findOtpByEmail(user!.email);

    if (existingOtp?.secret != otp || existingOtp.expiresAt < new Date()) {
      throw new APIError("Invalid OTP", STATUS.bad);
    }

    await this.userRepository.changeEmail(user!.id, email);
  }

  async handleBusinessModeChange(userId: string, isLive: boolean) {

    if(!isLive){
      const user = await this.userRepository.findUserById(userId);
      if(!user?.businessProfile?.onboarded){
        throw new APIError("Complete onboarding process to switch to live mode", STATUS.bad)
      }
    }
    await this.userRepository.changeBusinessMode(userId, isLive);

    return {
      message: "Mode Changed Successfully",
      payload: null,
    };
  }
}
