import Joi from "joi";
import { 
    CreateSubscriptionDto, 
    CreateSubscriptionPlanDto, 
    UpdateSubscriptionPlanDto,
    GetSubscriptionsDto
 } from "@/dto/subscription.dto";
import { Network, SubscriptionDuration } from "../../generated/prisma";

export const createSubscriptionPlanValidation = (data: CreateSubscriptionPlanDto) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100).required().messages({
      'string.min': 'Plan name must be at least 3 characters',
      'string.max': 'Plan name cannot exceed 100 characters',
      'any.required': 'Plan name is required',
    }),
    duration: Joi.string().valid(...Object.values(SubscriptionDuration)).required().messages({
      'any.only': 'Duration must be a valid subscription duration',
      'any.required': 'Duration is required',
    }),
    amount: Joi.number().positive().min(0.01).max(1000000).required().messages({
      'number.positive': 'Amount must be greater than 0',
      'number.min': 'Minimum amount is 0.01',
      'number.max': 'Maximum amount is 1,000,000',
      'any.required': 'Amount is required',
    }),
    currency: Joi.string().length(3).uppercase().required().messages({
      'string.length': 'Currency must be a 3-letter code (e.g., USD, EUR)',
      'any.required': 'Currency is required',
    }),
  });

  return schema.validate(data);
};

export const updateSubscriptionPlanValidation = (data: UpdateSubscriptionPlanDto) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100).messages({
      'string.min': 'Plan name must be at least 3 characters',
      'string.max': 'Plan name cannot exceed 100 characters',
    }),
    duration: Joi.string().valid(...Object.values(SubscriptionDuration)).messages({
      'any.only': 'Duration must be a valid subscription duration',
    }),
    amount: Joi.number().positive().min(0.01).max(1000000).messages({
      'number.positive': 'Amount must be greater than 0',
      'number.min': 'Minimum amount is 0.01',
      'number.max': 'Maximum amount is 1,000,000',
    }),
    currency: Joi.string().length(3).uppercase().messages({
      'string.length': 'Currency must be a 3-letter code (e.g., USD, EUR)',
    }),
  });

  return schema.validate(data);
};

export const createSubscriptionValidation = (data: CreateSubscriptionDto) => {
  const schema = Joi.object({
    customerId: Joi.string().required().messages({
      'any.required': 'Customer ID is required',
    }),
    planId: Joi.string().required().messages({
      'any.required': 'Plan ID is required',
    }),
    network: Joi.string().valid(...Object.values(Network)).required().messages({
      'any.only': 'Network must be a valid network',
      'any.required': 'Network is required',
    }),
  });

  return schema.validate(data);
};

export const subscriptionIdValidation = (data: GetSubscriptionsDto) => {
  const schema = Joi.object({
    subscriptionId: Joi.string().required().messages({
      'any.required': 'Subscription ID is required',
    }),
    planId: Joi.string().optional().messages({
    'any.only': 'Plan ID must be a string'
    })
  });

  return schema.validate(data);
};

export const planIdValidation = (data: { planId: string }) => {
  const schema = Joi.object({
    planId: Joi.string().required().messages({
      'any.required': 'Plan ID is required',
    }),
  });

  return schema.validate(data);
};

export const customerIdValidation = (data: { customerId: string, planId?: string }) => {
  const schema = Joi.object({
    customerId: Joi.string().required().messages({
      'any.required': 'Customer ID is required',
    }),
    planId: Joi.string().optional().messages({
      'any.only': 'Plan ID must be a string'
    })
  });

  return schema.validate(data);
};
