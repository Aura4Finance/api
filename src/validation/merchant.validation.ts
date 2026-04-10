import Joi from "joi";
import { getAllMerchantsDto, updateMerchantProfileDto } from "@/dto/merchant.dto";

export const updateMerchantProfileSchemaValidation = (data: updateMerchantProfileDto) => {
    const schema = Joi.object({
        firstName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
          'string.min': 'First name must be at least 2 characters',
          'string.max': 'First name cannot exceed 50 characters',
          'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
          'any.required': 'First name is required',
        }),
        lastName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s'-]+$/).required().messages({
          'string.min': 'Last name must be at least 2 characters',
          'string.max': 'Last name cannot exceed 50 characters',
          'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
          'any.required': 'Last name is required',
        }),
        businessName: Joi.string().min(2).max(100).required().messages({
          'string.min': 'Business name must be at least 2 characters',
          'string.max': 'Business name cannot exceed 100 characters',
          'any.required': 'Business name is required',
        }),
        businessSector: Joi.string().max(100).required().messages({
          'string.max': 'Business sector cannot exceed 100 characters',
          'any.required': 'Business sector is required',
        }),
        country: Joi.string().length(2).uppercase().required().messages({
          'string.length': 'Country must be a 2-letter code',
          'any.required': 'Country is required',
        }),
        websiteLink: Joi.string().uri({ scheme: ['http', 'https'] }).required().messages({
          'string.uri': 'Website link must be a valid URL starting with http:// or https://',
          'any.required': 'Website link is required',
        })
    })

    return schema.validate(data);
}

export const getAllMerchantSchemaValidation = (data: getAllMerchantsDto) => {
    const schema = Joi.object({
        country: Joi.string().length(2).uppercase().optional().messages({
          'string.length': 'Country must be a 2-letter code',
        }),
        businessSector: Joi.string().optional(),
        businessName: Joi.string().optional(),
        onboarded: Joi.boolean().optional(),
        disabled: Joi.boolean().optional(),
        search: Joi.string().max(100).optional().messages({
          'string.max': 'Search term cannot exceed 100 characters',
        }),
        countryList: Joi.string().optional(),
        sortBy: Joi.string().valid('businessName', 'createdAt').optional().messages({
          'any.only': 'Sort by must be either businessName or createdAt',
        }),
        sortOrder: Joi.string().valid('asc', 'desc').optional().messages({
          'any.only': 'Sort order must be either asc or desc',
        }),
        cursor: Joi.string().optional(),
        limit: Joi.number().integer().min(1).max(100).optional().messages({
          'number.min': 'Limit must be at least 1',
          'number.max': 'Limit cannot exceed 100 items',
        }),
    })
    return schema.validate(data);
}