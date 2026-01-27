import Joi from "joi";
import { getAllMerchantsDto, updateMerchantProfileDto } from "@/dto/merchant.dto";

export const updateMerchantProfileSchemaValidation = (data: updateMerchantProfileDto) => {
    const schema = Joi.object({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        businessName: Joi.string().required(),
        businessSector: Joi.string().required(),
        country: Joi.string().required(),
        websiteLink: Joi.string().required()
    })

    return schema.validate(data);
}

export const getAllMerchantSchemaValidation = (data: getAllMerchantsDto) => {
    const schema = Joi.object({
        country: Joi.string().optional(),
        businessSector: Joi.string().optional(),
        businessName: Joi.string().optional(),
        onboarded: Joi.boolean().optional(),
        disabled: Joi.boolean().optional(),
        search: Joi.string().optional(),
        countryList: Joi.string().optional(),
        sortBy: Joi.string().valid('businessName', 'createdAt').optional(),
        sortOrder: Joi.string().valid('asc', 'desc').optional(),
        cursor: Joi.string().optional(),
        limit: Joi.number().integer().min(1).max(20).optional(),
    })
    return schema.validate(data);
}