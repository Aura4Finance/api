import {
  ChangeEmailDto,
  OnboardUserDto,
  VerifyEmailChangeDto,
} from "@/dto/user.dto";
import Joi from "joi";

export const onboardingSchemaValidation = (data: OnboardUserDto) => {
  const schema = Joi.object({
    businessName: Joi.string().min(2).max(100).pattern(/^[a-zA-Z0-9\s&'-]+$/).required().messages({
      'string.min': 'Business name must be at least 2 characters',
      'string.max': 'Business name cannot exceed 100 characters',
      'string.pattern.base': 'Business name can only contain letters, numbers, spaces, &, hyphens, and apostrophes',
      'any.required': 'Business name is required',
    }),
    businessSector: Joi.string().max(100).required().messages({
      'string.max': 'Business sector cannot exceed 100 characters',
      'any.required': 'Business sector is required',
    }),
    country: Joi.string().required().messages({
      'string.length': 'Country must be a valid 2-letter country code (e.g., US, GB)',
      'any.required': 'Country is required',
    }),
    websiteLink: Joi.string().uri({ scheme: ['http', 'https'] }).optional().messages({
      'string.uri': 'Website link must be a valid URL starting with http:// or https://',
    }),
  });

  return schema.validate(data);
};

export const changeEmailSchemaValidation = (data: ChangeEmailDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  });

  return schema.validate(data);
};

export const verifyEmailChangeSchemaValidation = (
  data: VerifyEmailChangeDto
) => {
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

export const chechAdminMode = (data: any) => {
  const schema = Joi.object({
    mode: Joi.string().valid("test", "live").required().messages({
      'any.only': 'Mode must be either "test" or "live"',
      'any.required': 'Mode is required',
    })
  })
  return schema.validate(data);
}
