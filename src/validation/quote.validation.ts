import Joi from "joi";
import { Mode, Token } from "../../generated/prisma";

/**
 * Validation schema for getting token price.
 * Validates the amount in USDC, the token type, and the mode (test or live).
 * @param data The input data to validate.
 * @returns The result of the validation, including any errors and the validated value.
 */
export const getTokenPriceValidation = (data: any) => {
    const schema = Joi.object({
        amountInUSDC: Joi.number().positive().required().messages({
            'number.positive': 'Amount in USDC must be greater than 0',
        }),
        mode: Joi.string().valid(...Object.values(Mode)).required().messages({
            'any.only': 'Mode must be either test or live',
        }),
        token: Joi.string().valid(...Object.values(Token)).required().messages({
            'any.only': `Token must be one of the following: ${Object.values(Token).join(', ')}`,
        }),
    });

    return schema.validate(data);
}
