import Joi from "joi";
import { 
    CreateAccountDto, 
    UpdateAccountDto
 } from "@/dto/fiat.dto";

export const addBankAccountSchemaValidation = (data: CreateAccountDto) => {
    const schema = Joi.object({
        accountNumber: Joi.string().min(10).max(10).pattern(/^\d+$/).required().messages({
          'string.min': 'Account number must be exactly 10 digits',
          'string.max': 'Account number must be exactly 10 digits',
          'string.pattern.base': 'Account number must contain only numbers',
          'any.required': 'Account number is required',
        }),
        bankCode: Joi.string().min(2).max(8).required().messages({
          'string.min': 'Bank code must be at least 2 characters',
          'string.max': 'Bank code cannot exceed 8 characters',
          'any.required': 'Bank code is required',
        }),
        isPrimary: Joi.boolean().optional()
    });

    return schema.validate(data);
}

export const resolveAccountSchemaValidation = (data: { accountNumber: string, bankCode: string }) => {
    const schema = Joi.object({
        accountNumber: Joi.string().min(10).max(10).pattern(/^\d+$/).required().messages({
          'string.min': 'Account number must be exactly 10 digits',
          'string.max': 'Account number must be exactly 10 digits',
          'string.pattern.base': 'Account number must contain only numbers',
          'any.required': 'Account number is required',
        }),
        bankCode: Joi.string().min(2).max(8).required().messages({
          'string.min': 'Bank code must be at least 2 characters',
          'string.max': 'Bank code cannot exceed 8 characters',
          'any.required': 'Bank code is required',
        })
    });
    return schema.validate(data);
}

export const deleteAccountSchemaValidation = (data: { id: string }) => {
    const schema = Joi.object({
        id: Joi.string().required().messages({
          'any.required': 'Account ID is required',
        })
    })
    return schema.validate(data);
}

export const updateAccountSchemaValidation = ( data: UpdateAccountDto) => {
    const schema = Joi.object({
        isPrimary: Joi.boolean().optional()
    })
    return schema.validate(data);

}