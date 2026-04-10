import { CreatePaylinkDto, PaylinkReferenceDto  } from "@/dto/paylink.dto";
import Joi from "joi";

export const createPaylinkValidation = (data: CreatePaylinkDto) => {
  const schema = Joi.object({
    title: Joi.string().min(3).max(100).required().messages({
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 100 characters',
      'any.required': 'Title is required',
    }),
    description: Joi.string().max(500).required().messages({
      'string.max': 'Description cannot exceed 500 characters',
      'any.required': 'Description is required',
    }),
    amount: Joi.number().positive().min(0.01).max(1000000).required().messages({
      'number.positive': 'Amount must be greater than 0',
      'number.min': 'Minimum amount is 0.01',
      'number.max': 'Maximum amount is 1,000,000',
      'any.required': 'Amount is required',
    }),
    currency: Joi.string().length(3).uppercase().required().messages({
      'string.length': 'Currency must be a 3-letter code',
      'any.required': 'Currency is required',
    })
  });

  return schema.validate(data);
};

export const editPaylinkValidation = (data: Partial<CreatePaylinkDto>) => {
  const schema = Joi.object({
    title: Joi.string().min(3).max(100).messages({
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 100 characters',
    }),
    description: Joi.string().max(500).messages({
      'string.max': 'Description cannot exceed 500 characters',
    }),
    amount: Joi.number().positive().min(0.01).max(1000000).messages({
      'number.positive': 'Amount must be greater than 0',
      'number.min': 'Minimum amount is 0.01',
      'number.max': 'Maximum amount is 1,000,000',
    }),
    currency: Joi.string().length(3).uppercase().messages({
      'string.length': 'Currency must be a 3-letter code',
    })
  }); 
  return schema.validate(data);
}

export const editPaymentLinkImageValidation = (data: { imageId?: string }) => {
  const schema = Joi.object({
    imageId: Joi.string().required().messages({
      'any.required': 'Image ID is required',
    }),
  });
  return schema.validate(data);
};


export const paymentLinkReferenceValidation = (data: PaylinkReferenceDto) => {
  const schema =  Joi.object({
    paylinkId: Joi.string().required().messages({
      'any.required': 'Payment link ID is required',
    }),
  });
  return  schema.validate(data);
}
