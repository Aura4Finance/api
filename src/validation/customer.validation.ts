import { CreateCustomerDto, GetCustomersQueryDto, GetACustomerQueryDto } from "@/dto/customer.dto";
import Joi from "joi";

export const createCustomerValidation = (data: CreateCustomerDto) => {
  const schema = Joi.object({
    firstname: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 50 characters',
      'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'First name is required',
    }),
    lastname: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 50 characters',
      'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'Last name is required',
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  });

  return schema.validate(data);
};

export const getACustomerQueryValidation = (data: GetACustomerQueryDto) => {
  const schema = Joi.object<GetACustomerQueryDto>({
    customerId: Joi.string().required().messages({
      'any.required': 'Customer ID is required',
    })
  })

  return schema.validate(data);
}

export const getCustomerQueryValidation = (data: GetCustomersQueryDto) => {
  const schema = Joi.object<GetCustomersQueryDto>({
    amountSpent: Joi.string()
      .valid(
        "BELOW10USDT",
        "FROM10TO30USDT",
        "FROM30TO100USDT",
        "FROM100TO200USDT",
        "FROM200TO500USDT",
        "ABOVE500USDT"
      ).messages({
        'any.only': 'Amount spent must be one of the predefined ranges'
      }),
    mode: Joi.string().valid("live", "test").optional().messages({
      'any.only': 'Mode must be either "live" or "test"',
    }),
    userId: Joi.string().optional(),
    limit: Joi.number().integer().positive().default(20).max(100).messages({
      'number.positive': 'Limit must be a positive number',
      'number.max': 'Limit cannot exceed 100 items',
    }),
    cursor: Joi.string().optional(),
  });

  return schema.validate(data);
}
