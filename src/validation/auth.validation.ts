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
} from "@/dto/auth.dto";

export const loginSchemaValidation = (data: LoginDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().min(8).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'any.required': 'Password is required',
    }),
  });

  return schema.validate(data);
};

export const createAccountValidation = (data: CreateAccountDto) => {
  const schema = Joi.object({
    firstname: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 50 characters',
      'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'First name is required',
    }),
    lastname: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 50 characters',
      'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'Last name is required',
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required',
    }),
  });

  return schema.validate(data);
};

export const adminAuthSchemaValidation = (data: AdminAuthDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid admin email address',
      'any.required': 'Email is required',
    }),
    firstname: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 50 characters',
      'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'First name is required',
    }),
    lastname: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 50 characters',
      'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'Last name is required',
    })
  });

  return schema.validate(data);
};

export const resetAdminPasswordValidation = (data: ResetAdminPasswordDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    oldPassword: Joi.string().min(8).required().messages({
      'string.min': 'Old password must be at least 8 characters',
      'any.required': 'Current password is required',
    }),
    newPassword: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().disallow(Joi.ref('oldPassword')).messages({
      'string.min': 'New password must be at least 8 characters',
      'string.max': 'New password cannot exceed 128 characters',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'New password is required',
      'any.invalid': 'New password must be different from the old password',
    }),
  });

  return schema.validate(data);
};

export const otpSchemaValidation = (data: OTPDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    otp: Joi.string().min(6).max(6).pattern(/^\d+$/).required().messages({
      'string.min': 'OTP must be exactly 6 digits',
      'string.max': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only numbers',
      'any.required': 'OTP is required',
    }),
  });

  return schema.validate(data);
};

export const resendOtpSchemaValidation = (data: ResendOtpDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  });

  return schema.validate(data);
};

export const resetPasswordSchemaValidation = (data: ResetPasswordDto) => {
  const schema = Joi.object({
    otp: Joi.string().min(6).max(6).pattern(/^\d+$/).required().messages({
      'string.min': 'OTP must be exactly 6 digits',
      'string.max': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only numbers',
      'any.required': 'OTP is required',
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required',
    }),
  });

  return schema.validate(data);
};

export const exchangeCodeForAccessTokenValidation = (data: AuthCodeDto) => {
  const schema = Joi.object({
    otp: Joi.string().min(6).required().messages({
      'string.min': 'Authentication code must be at least 6 characters',
      'any.required': 'Authentication code is required',
    }),
    type: Joi.string().valid("orafi", "google").required().messages({
      'any.only': 'Type must be either "orafi" or "google"',
      'any.required': 'Type is required',
    }),
  });

  return schema.validate(data);
}

export const verify2FASchemaValidation = (data: { userId: string, token: string }) => {
  const schema = Joi.object({
    userId: Joi.string().required().messages({
      'any.required': 'User ID is required',
    }),
    token: Joi.string().min(6).max(6).pattern(/^\d+$/).required().messages({
      'string.min': '2FA token must be exactly 6 digits',
      'string.max': '2FA token must be exactly 6 digits',
      'string.pattern.base': '2FA token must contain only numbers',
      'any.required': '2FA token is required',
    }),
  });
  return schema.validate(data);
}
