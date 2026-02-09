import Joi from "joi";
import { 
    CreateAccountDto, 
    UpdateAccountDto
 } from "@/dto/fiat.dto";

export const addBankAccountSchemaValidation = (data: CreateAccountDto) => {
    const schema = Joi.object({
        accountNumber: Joi.string().min(10).max(10).required(),
        bankCode: Joi.string().min(2).max(8).required(),
        bankName: Joi.string().required(),
        isPrimary: Joi.bool()
    });

    return schema.validate(data);
}

export const resolveAccountSchemaValidation = (data: { accountNumber: string, bankCode: string }) => {
    const schema = Joi.object({
        accountNumber: Joi.string().min(10).max(10).required(),
        bankCode: Joi.string().min(2).max(8).required()
    });
    return schema.validate(data);
}

export const deleteAccountSchemaValidation = (data: { id: string }) => {
    const schema = Joi.object({
        id: Joi.string().required()
    })
    return schema.validate(data);
}

export const updateAccountSchemaValidation = ( data: UpdateAccountDto) => {
    const schema = Joi.object({
        isPrimary: Joi.bool()
    })
    return schema.validate(data);

}