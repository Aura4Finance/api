import { CreatePaylinkDto } from "@/dto/paylink.dto";
import Joi from "joi";

export const createPaylinkValidation = (data: CreatePaylinkDto) => {
  const schema = Joi.object({
    title: Joi.string().min(3).required(),
    description: Joi.string().required(),
    amount: Joi.number().min(1).required(),
  });

  return schema.validate(data);
};
