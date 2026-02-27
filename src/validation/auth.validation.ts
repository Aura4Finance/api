import Joi from "joi";
import {
  CreateAccountDto,
  LoginDto,
  OTPDto,
  ResendOtpDto,
  ResetPasswordDto,
  ResetAdminPasswordDto,
  AdminAuthDto,
  AuthCodeDto,
} from "../dto/auth.dto";

export const loginSchemaValidation = (data: LoginDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
  });

  return schema.validate(data);
};

export const createAccountValidation = (data: CreateAccountDto) => {
  const schema = Joi.object({
    firstname: Joi.string().min(2).required(),
    lastname: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
  });

  return schema.validate(data);
};

export const adminAuthSchemaValidation = (data: AdminAuthDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    firstname: Joi.string().min(5),
    lastname: Joi.string().min(5)
  });

  return schema.validate(data);
};

export const resetAdminPasswordValidation = (data: ResetAdminPasswordDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    oldPassword: Joi.string().min(8).required(),
    newPassword: Joi.string().min(8).required(),
  });

  return schema.validate(data);
};

export const otpSchemaValidation = (data: OTPDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().min(6).max(6).required(),
  });

  return schema.validate(data);
};

export const resendOtpSchemaValidation = (data: ResendOtpDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
  });

  return schema.validate(data);
};

export const resetPasswordSchemaValidation = (data: ResetPasswordDto) => {
  const schema = Joi.object({
    otp: Joi.string().min(6).max(6).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
  });

  return schema.validate(data);
};

export const exchangeCodeForAccessTokenValidation = (data: AuthCodeDto) => {
  const schema = Joi.object({
    otp: Joi.string().min(6).required(),
    type: Joi.string().valid("orafi", "google").required(),
  });

  return schema.validate(data);
}

export const verify2FASchemaValidation = (data: { userId: string, token: string }) => {
  const schema = Joi.object({
    userId: Joi.string().required(),
    token: Joi.string().min(6).max(6).required(),
  });
  return schema.validate(data);
}
