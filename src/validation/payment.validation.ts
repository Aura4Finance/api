import { CreatePaymentDto, VerifyPaymentDto } from "@/dto/payment.dto";
import Joi from "joi";
import { TOKENS } from "@/constants/tokens.constants";

export const createPaymentValidation = (data: CreatePaymentDto) => {
  const schema = Joi.object({
    amount: Joi.number().positive().min(0.01).max(1000000).required().messages({
      'number.positive': 'Amount must be greater than 0',
      'number.min': 'Minimum payment amount is 0.01',
      'number.max': 'Maximum payment amount is 1,000,000',
      'any.required': 'Amount is required',
    }),
    customer: Joi.object({
      fullname: Joi.string().max(100).optional().messages({
        'string.max': 'Customer full name cannot exceed 100 characters',
      }),
      email: Joi.string().email().optional().messages({
        'string.email': 'Customer email must be valid',
      }),
    }),
    customerId: Joi.string().optional(),
    currency: Joi.string().length(3).uppercase().required().messages({
      'string.length': 'Currency must be a 3-letter code (e.g., USD, EUR)',
      'any.required': 'Currency is required',
    }),
    network: Joi.valid("SUI").required().messages({
      'any.only': 'Network must be SUI',
      'any.required': 'Network is required',
    }),
    txRef: Joi.string().max(100).optional().messages({
      'string.max': 'Transaction reference cannot exceed 100 characters',
    }),
    redirectUrl: Joi.string().uri({ scheme: ['http', 'https'] }).optional().messages({
      'string.uri': 'Redirect URL must be a valid URL starting with http:// or https://',
    })
  });

  return schema.validate(data);
};

export const updatePaymentIntentValidation = (data: any) =>  {
  const schema = Joi.object({
    token: Joi.string().valid(...Object.values(TOKENS).map(token => token.symbol)).optional().messages({
      'any.required': 'Token is required for updating payment intent',
    }),
    intent: Joi.string().valid("transfer_address", "deposit_address").optional().messages({
      'any.only': 'Intent must be transfer_address or deposit_address',
      'any.required': 'Intent is required for updating payment intent',
    })
  });
  return schema.validate(data);
}

export const verifyPaymentValidation = (data: VerifyPaymentDto) => {
  const schema = Joi.object({
    paymentId: Joi.string().required().messages({
      'any.required': 'Payment ID is required',
    }),
    token: Joi.string().valid(...Object.values(TOKENS).map(token => token.symbol)).required().messages({
      'any.required': 'Token is required to verify payment',
    }),
  });

  return schema.validate(data);
};

export const verifyPaymentInformationRetrievalValidation = (data: any) => {
  const schema = Joi.object({
    paymentId: Joi.string().required().messages({
      'any.required': 'Payment ID is required for information retrieval',
    }),
  });

  return schema.validate(data);
} 
