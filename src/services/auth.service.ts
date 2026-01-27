import { Service } from "typedi";
import { UserRepository } from "../repositories/user/user.repository";
import {
  CreateAccountDto,
  LoginDto,
  OTPDto,
  ResendOtpDto,
  ResetPasswordDto,
  AdminAuthDto,
  AuthCodeDto,
  ResetAdminPasswordDto,
} from "../dto/auth.dto";
import { APIError } from "../utils/error-handler";
import argon from "argon2";
import { STATUS } from "../constants/status.constant";
import { WalletService } from "./wallet.service";
import crypto from "crypto";
import { AuthRepository } from "../repositories/auth.repository";
import { EmailService } from "./email.service";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { EmailQueue } from "./schedule.email.service";
import { v4 as uuid } from "uuid";
import { redisClient } from "@/middlewares/rate-limit.middleware";

@Service()
export class AuthService {
  private jwtSecret: string;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly walletService: WalletService,
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,
    private readonly emailQueue: EmailQueue
  ) {
    this.jwtSecret = <string>process.env.JWT_SECRET;
  }

  async registerUser(body: CreateAccountDto) {
    const { firstname, lastname, email, password } = body;

    const existingUser = await this.userRepository.findUserByEmail(email);

    if (existingUser) {
      throw new APIError(
        "User with this email already exists",
        STATUS.conflict
      );
    }

    const hashedPassword = await argon.hash(password);

    const { privateKey, publicKey } = await this.walletService.createWallet();

    const newUser = await this.userRepository.createMerchant(
      firstname,
      lastname,
      email,
      hashedPassword,
      privateKey,
      publicKey,
      'LOCAL'
    );

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const otp = await this.authRepository.registerOtp(newUser.id, otpSecret);
    await this.emailService.sendOtp(
      newUser.email,
      otp.secret
    );

    return {
      message: "User created successfully - OTP has been send to your mail",
      payload: null,
    };
  }

  async registerAdmin(body: AdminAuthDto) {
    const { firstname, lastname, email } = body;

    const existingUser = await this.userRepository.findUserByEmail(email);

    if (existingUser) {
      throw new APIError(
        "User with this email already exists",
        STATUS.conflict
      );
    }

    const password = crypto.randomBytes(6).toString("hex");
    const hashedPassword = await argon.hash(password);

    this.userRepository.createAdmin(firstname, lastname, email, hashedPassword);

    return {
      payload: {
        email,
        password,
      },
      message:
        "Admin created successfully - New Admin needs to login to change password.",
    };
  }

  async verifyEmail(body: OTPDto) {
    const { email, otp } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError(
        "User with this email does not exist",
        STATUS.notFound
      );
    }

    const existingOtp = await this.authRepository.findOtpByEmail(email);

    if (existingOtp?.secret != otp || existingOtp.expiresAt < new Date()) {
      throw new APIError("Invalid OTP", STATUS.bad);
    }

    await this.userRepository.verifyEmail(user.id);
    await this.emailQueue.addScheduler({
      email: user.email,
      firstName: user.firstname
    });
    await this.authRepository.deleteOtp(existingOtp.id);

    return {
      message: "Email Verified Successfully",
      payload: null,
    };
  }

  async resendOtp(body: ResendOtpDto) {
    const { email } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("User with email does not exist", STATUS.notFound);
    }

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const otp = await this.authRepository.registerOtp(user.id, otpSecret);


    await this.emailService.sendOtp(
      user.email,
      otp.secret
    );

    return {
      message: "OTP resent successfully",
      payload: null,
    };
  }

  async adminSignin(body: LoginDto) {
    const { email, password } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("User with email does not exist", STATUS.notFound);
    }

    if (user.provider != "LOCAL") {
      throw new APIError("Forbidden", STATUS.bad);
    }

    const passwordMatch = await argon.verify(user.password, password);

    if (!passwordMatch) {
      throw new APIError("Invalid password", STATUS.unauthorized);
    }

    if (!user.emailVerified) {
      throw new APIError("Admin must change password!", STATUS.notAcceptable);
    }
    const jwtPayload = {
      id: user?.id,
      email: user?.email,
      jti: uuid()
    };
    const accessToken = jwt.sign(jwtPayload, this.jwtSecret, { expiresIn: '30d' });
    return {
      message: "Admin Login Successfully!",
      payload: {
        user,
        accessToken
      }
    }
  }

  async signIn(body: LoginDto) {
    const { email, password } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("User with email does not exist", STATUS.notFound);
    }

    if (user.provider != "LOCAL") {
      throw new APIError("User account created with Google. Sign in with Google to cotinue", STATUS.bad)
    }

    if (!user.emailVerified) {
      throw new APIError("Email not verified", STATUS.forbidden);
    }

    const passwordMatch = await argon.verify(user.password, password);

    if (!passwordMatch) {
      throw new APIError("Invalid password", STATUS.unauthorized);
    }

    const otpSecret = `orafi_${crypto.randomBytes(32).toString("hex")}`;
    const hashedCode = crypto
      .createHash("sha256")
      .update(otpSecret)
      .digest("hex");

    await this.authRepository.registerOtp(user.id, hashedCode);


    return {
      message: "User login successful",
      payload: {
        otp: otpSecret,
        user,
      },
    };
  }

  async signOut(jtl: string, exp: number) {
    const ttl = exp - Math.floor(Date.now() / 1000);
    await redisClient.set(`bl:${jtl}`, '1', "EX", ttl);

    return {
      message: "User signed out successfully",
      payload: null,
    };
  }

  async exchangeCodeForAccessToken(body: AuthCodeDto) {
    const { otp } = body;
    let jwtPayload: any;
    let user: any;
    if (body.type === "google") {
      const client = new OAuth2Client(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        process.env.REDIRECT_URI
      );
      const { tokens } = await client.getToken(otp);
      if (!tokens) {
        throw new APIError("Invalid code", STATUS.bad);
      }
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: process.env.CLIENT_ID as string
      })
      const payload = ticket.getPayload();
      user = await this.userRepository.findUserByEmail(payload?.email as string);
      if (!user) {
        const { privateKey, publicKey } = await this.walletService.createWallet();

        const newUser = await this.userRepository.createMerchant(
          payload?.given_name as string,
          payload?.family_name as string,
          payload?.email as string,
          "",
          privateKey,
          publicKey,
          'GOOGLE',
          payload?.sub as string
        );
        await this.userRepository.verifyEmail(newUser.id);
      }

    } else {
      const hashedCode = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
      const existingOtp = await this.authRepository.findDtoByCode(hashedCode);

      if (!existingOtp || existingOtp.expiresAt < new Date()) {
        throw new APIError("Invalid Otp", STATUS.bad)
      }
      user = await this.userRepository.findUserById(existingOtp?.userId);
      await this.authRepository.deleteOtp(existingOtp.id);
    }
    jwtPayload = {
      id: user?.id,
      email: user?.email,
      jti: uuid()
    };
    const accessToken = jwt.sign(jwtPayload, this.jwtSecret, { expiresIn: '7d' });
    return {
      message: "Code is authentic",
      payload: {
        user,
        accessToken
      }
    }
  }

  async forgotPassword(body: ResendOtpDto) {
    const { email } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("User with email does not exist", STATUS.notFound);
    }

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const otp = await this.authRepository.registerOtp(user.id, otpSecret);

    await this.emailService.sendOtp(
      user.email,
      otp.secret
    );

    return {
      message: "Password reset OTP sent successfully - Check your email",
      payload: null,
    };
  }

  async resetPassword(body: ResetPasswordDto) {
    const { otp, email, password } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("User with email does not exist", STATUS.notFound);
    }

    const existingOtp = await this.authRepository.findOtpByEmail(email);

    if (existingOtp?.secret != otp || existingOtp.expiresAt < new Date()) {
      throw new APIError("Invalid OTP", STATUS.bad);
    }

    const hashedPassword = await argon.hash(password);

    await this.userRepository.changePassword(user.id, hashedPassword);

    return {
      message: "Password reset successfully",
      payload: null,
    };
  }

  async changeAdminPassword(body: ResetAdminPasswordDto) {
    const { email, oldPassword, newPassword } = body;

    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new APIError("User with email does not exist", STATUS.notFound);
    }

    if (user.emailVerified) {
      throw new APIError("Admin has already changed password", STATUS.bad);
    }

    const passwordMatch = await argon.verify(user.password, oldPassword);
    if (!passwordMatch) {
      throw new APIError("Invalid password", STATUS.unauthorized);
    }
    const hashedPassword = await argon.hash(newPassword);

    await this.userRepository.changePassword(user.id, hashedPassword);
    await this.userRepository.verifyEmail(user.id);

    return {
      message: "Password reset successfully",
      payload: null,
    };
  }
}
