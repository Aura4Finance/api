import { CreatePaymentDto, VerifyPaymentDto } from "@/dto/payment.dto";
import Joi from "joi";

export const createPaymentValidation = (data: CreatePaymentDto) => {
  const schema = Joi.object({
    amount: Joi.number().min(1).required(),
    customer: Joi.object({
      fullname: Joi.string().required(),
      email: Joi.string().email().required(),
    }),
    txRef: Joi.string().optional(),
    redirectUrl: Joi.string().optional()
  });

  return schema.validate(data);
};

export const verifyPaymentValidation = (data: VerifyPaymentDto) => {
  const schema = Joi.object({
    paymentId: Joi.string().required(),
  });

  return schema.validate(data);
};

export const verifyPaymentInformationRetrievalValidation = (data: any) => {
  const schema = Joi.object({
    paymentId: Joi.string().required(),
  });

  return schema.validate(data);
} 
