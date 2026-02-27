import { CreatePaymentDto, VerifyPaymentDto } from "@/dto/payment.dto";
import Joi from "joi";

export const createPaymentValidation = (data: CreatePaymentDto) => {
  const schema = Joi.object({
    amount: Joi.number().min(1).required(),
    customer: Joi.object({
      fullname: Joi.string().optional(),
      email: Joi.string().email().optional(),
    }),
    customerId: Joi.string().optional(),
    currency: Joi.string().required(),
    network: Joi.valid("SUI"),
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
