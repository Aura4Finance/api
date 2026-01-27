import { ChangePasswordDto } from "@/dto/security.dto";
import Joi from "joi";

export const changePasswordValidation = (data: ChangePasswordDto) => {
  const schema = Joi.object({
    password: Joi.string().min(8).required(),
  });

  return schema.validate(data);
};
