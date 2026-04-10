import { ChangePasswordDto } from "@/dto/security.dto";
import Joi from "joi";

export const changePasswordValidation = (data: ChangePasswordDto) => {
  const schema = Joi.object({
    password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required',
    }),
  });

  return schema.validate(data);
};
