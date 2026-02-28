import { CreatePaylinkDto, PaylinkReferenceDto  } from "@/dto/paylink.dto";
import Joi from "joi";

export const createPaylinkValidation = (data: CreatePaylinkDto) => {
  const schema = Joi.object({
    title: Joi.string().min(3).required(),
    description: Joi.string().required(),
    amount: Joi.number().min(1).required(),
    currency: Joi.string()
  });

  return schema.validate(data);
};

export const editPaylinkValidation = (data: Partial<CreatePaylinkDto>) => {
  const schema = Joi.object({
    title: Joi.string().min(3),
    description: Joi.string(),
    amount: Joi.number().min(1),
  }); 
  return schema.validate(data);
}

export const paymentLinkReferenceValidation = (data: PaylinkReferenceDto) => {
  const schema =  Joi.object({
    paylinkId: Joi.string().required(),
  });
  return  schema.validate(data);
}
