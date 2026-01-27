import {
  ChangeEmailDto,
  OnboardUserDto,
  VerifyEmailChangeDto,
} from "@/dto/user.dto";
import Joi from "joi";

export const onboardingSchemaValidation = (data: OnboardUserDto) => {
  const schema = Joi.object({
    businessName: Joi.string().min(2).required(),
    businessSector: Joi.string().required(),
    country: Joi.string().required(),
    websiteLink: Joi.string().optional(),
  });

  return schema.validate(data);
};

export const changeEmailSchemaValidation = (data: ChangeEmailDto) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
  });

  return schema.validate(data);
};

export const verifyEmailChangeSchemaValidation = (
  data: VerifyEmailChangeDto
) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().min(6).max(6).required(),
  });

  return schema.validate(data);
};
