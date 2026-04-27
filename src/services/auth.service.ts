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
import speakeasy from "speakeasy";
import { UserService } from "./user/user.service";

@Service()
export class AuthService {
  private JWT_SECRET: string;
  private CLIENT_ID: string;
  private CLIENT_SECRET: string;
  private REDIRECT_URI: string;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,
    private readonly emailQueue: EmailQueue,
  ) {
    this.JWT_SECRET = <string>process.env.JWT_SECRET;
    this.CLIENT_ID = <string>process.env.CLIENT_ID;
    this.CLIENT_SECRET = <string>process.env.CLIENT_SECRET;
    this.REDIRECT_URI = <string>process.env.REDIRECT_URI;
  }

  async registerUser(body: CreateAccountDto) {
    const { firstname, lastname, email, password } = body;

    const existingUser = await this.userRepository.findUserByEmail(email);

    if (existingUser) {
      throw new APIError(
        "An account with this email already exists.",
        STATUS.conflict
      );
    }

    const hashedPassword = await argon.hash(password);

    const { address, derivationIndex } = await this.walletService.createWallet();

    const newUser = await this.userRepository.createMerchant(
      firstname,
      lastname,
      email,
      hashedPassword,
      address,
      derivationIndex,
      'LOCAL'
    );

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto
      .createHash("sha256")
      .update(otpSecret)
      .digest("hex");

    await this.authRepository.registerOtp(newUser.id, hashedCode);
    await this.emailService.sendOtp(newUser.email, otpSecret);

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
        "An account with this email already exists.",
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
        "No account found for this email.",
        STATUS.notFound
      );
    }

    const existingOtp = await this.authRepository.findOtpByEmail(email);

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    if (existingOtp?.secret != hashedOtp || existingOtp.expiresAt < new Date()) {
      throw new APIError("Invalid or expired OTP.", STATUS.bad);
    }

    await this.userRepository.verifyEmail(user.id);
    await this.emailQueue.addScheduler({
      email: user.email,
      firstName: user.firstname
    });
    await this.authRepository.deleteOtp(existingOtp.id);

    const { payload } = await this.userService.setup2FA(user.id);

    return {
      message: "Email Verified Successfully",
      payload,
    };
  }

  async resendOtp(body: ResendOtpDto) {
    const { email } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("No account found for this email.", STATUS.notFound);
    }

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto
      .createHash("sha256")
      .update(otpSecret)
      .digest("hex");
    await this.emailService.sendOtp(
      user.email,
      otpSecret
    );
    await this.authRepository.registerOtp(user.id, hashedCode);

    return {
      message: "OTP resent successfully",
      payload: null,
    };
  }

  async adminSignin(body: LoginDto) {
    const { email, password } = body;

    const user = await this.userRepository.findUserByEmail(email);

    if (!user) {
      throw new APIError("No admin account found for this email.", STATUS.notFound);
    }

    if (user.provider != "LOCAL") {
      throw new APIError("This account can only sign in with Google.", STATUS.bad);
    }

    const passwordMatch = await argon.verify(user.password, password);

    if (!passwordMatch) {
      throw new APIError("Incorrect password.", STATUS.unauthorized);
    }

    if (!user.emailVerified) {
      throw new APIError("Password reset required. Please change your password.", STATUS.notAcceptable);
    }
    const jwtPayload = {
      id: user?.id,
      email: user?.email,
      jti: uuid()
    };
    const accessToken = jwt.sign(jwtPayload, this.JWT_SECRET, { expiresIn: '30d' });
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
      throw new APIError("No account found for this email.", STATUS.notFound);
    }

    if (user.provider != "LOCAL") {
      throw new APIError("This account was created with Google. Please sign in with Google.", STATUS.bad)
    }

    if (!user.emailVerified) {
      throw new APIError("Email not verified. Please verify your email first.", STATUS.forbidden);
    }

    const passwordMatch = await argon.verify(user.password, password);

    if (!passwordMatch) {
      throw new APIError("Incorrect password.", STATUS.unauthorized);
    }

    let payload: any;
    if (user?.twoFactorEnabled) {
      payload = {
        twoFANeeded: true,
        userId: user.id
      }
    } else {
      payload = {
        twoFactorNeeded: false,
        otpSecret: await this.generateSecret(user.id)
      }
    }


    return {
      message: "User signed in successfully. Verify 2FA to continue",
      payload
    }
  }

  private async generateSecret(userId: string) {
    const otpSecret = `orafi_${crypto.randomBytes(32).toString("hex")}`;
    const hashedCode = crypto
      .createHash("sha256")
      .update(otpSecret)
      .digest("hex");

    await this.authRepository.registerOtp(userId, hashedCode);
    return otpSecret;
  }

  async verify2FAAndGenerateSecret(userId: string, token: string) {
    const user = await this.userRepository.findUserById(userId);
    if (!user) {
      throw new APIError("User account not found.", STATUS.notFound);
    }
    if (!user?.twoFactorEnabled) {
      await this.userService.verify2FA(userId, token);
    } else {
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token,
        window: 1
      });

      if (!verified) {
        throw new APIError("Invalid 2FA token. Please try again.", STATUS.bad);
      }
    }

    return {
      message: "User login successful",
      payload: await this.generateSecret(user.id),
    };
  }

  async exchangeCodeForAccessToken(body: AuthCodeDto) {
    const { otp } = body;
    let jwtPayload: any;
    let user: any;
    if (body.type === "google") {
      const client = new OAuth2Client(
        this.CLIENT_ID,
        this.CLIENT_SECRET,
        this.REDIRECT_URI
      );
      let ticket;
      try {
        const { tokens } = await client.getToken(otp); 

        if (!tokens.id_token) {
          throw new APIError("Google sign-in failed. No ID token returned.", STATUS.bad);
        }
        client.setCredentials(tokens);
        ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: this.CLIENT_ID,
        });

      } catch (err: any) {
        console.log(err)
        throw new APIError("Google sign-in failed. Please try again.", STATUS.bad);
      }
      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new APIError("Google sign-in failed. We couldn't retrieve your email.", STATUS.bad);
      }
      user = await this.userRepository.findUserByEmail(payload?.email as string);
      if (!user) {
        const { address, derivationIndex } = await this.walletService.createWallet();

         user = await this.userRepository.createMerchant(
          payload?.given_name as string,
          payload?.family_name as string,
          payload?.email as string,
          "",
          address,
          derivationIndex,
          'GOOGLE',
          payload?.sub as string
        );
        await this.userRepository.verifyEmail(user.id);
      }

    } else {
      const hashedCode = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
      const existingOtp = await this.authRepository.findDtoByCode(hashedCode);
      if (!existingOtp || existingOtp.expiresAt < new Date()) {
        throw new APIError("Invalid or expired OTP.", STATUS.bad);
      }
      user = await this.userRepository.findUserById(existingOtp?.userId);
      await this.authRepository.deleteOtp(existingOtp.id);
    }
    jwtPayload = {
      id: user?.id,
      email: user?.email,
      jti: uuid()
    };
    const accessToken = jwt.sign(jwtPayload, this.JWT_SECRET, { expiresIn: '7d' });
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
      throw new APIError("No account found for this email.", STATUS.notFound);
    }

    const otpSecret = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto
      .createHash("sha256")
      .update(otpSecret)
      .digest("hex");

    await this.authRepository.registerOtp(user.id, hashedCode);
    await this.emailService.sendOtp(
      user.email,
      otpSecret
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
      throw new APIError("No account found for this email.", STATUS.notFound);
    }

    const existingOtp = await this.authRepository.findOtpByEmail(email);

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    if (existingOtp?.secret != hashedOtp || existingOtp.expiresAt < new Date()) {
      throw new APIError("Invalid or expired OTP.", STATUS.bad);
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
      throw new APIError("No admin account found for this email.", STATUS.notFound);
    }

    if (user.emailVerified) {
      throw new APIError("Password has already been updated.", STATUS.bad);
    }

    const passwordMatch = await argon.verify(user.password, oldPassword);
    if (!passwordMatch) {
      throw new APIError("Incorrect password.", STATUS.unauthorized);
    }
    const hashedPassword = await argon.hash(newPassword);

    await this.userRepository.changePassword(user.id, hashedPassword);
    await this.userRepository.verifyEmail(user.id);

    const jwtPayload = {
      id: user?.id,
      email: user?.email,
      jti: uuid()
    };
    const accessToken = jwt.sign(jwtPayload, this.JWT_SECRET, { expiresIn: '7d' });

    return {
      message: "Password reset successfully",
      payload: accessToken,
    };
  }

}