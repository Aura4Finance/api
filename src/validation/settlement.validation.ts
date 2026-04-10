import { AddSettlementAccountDto } from "@/dto/settlement.dto";
import Joi from "joi";

export const addSettlementAccountSchemaValidation = (
  data: AddSettlementAccountDto
) => {
  const schema = Joi.object({
    walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required().messages({
      'string.pattern.base': 'Wallet address must be a valid SUI address (0x followed by 64 hex characters)',
      'any.required': 'Wallet address is required',
    }),
    network: Joi.valid("SUI").required().messages({
      'any.only': 'Network must be SUI',
      'any.required': 'Network is required',
    }),
    alias: Joi.string().min(1).max(50).required().messages({
      'string.min': 'Alias must have at least 1 character',
      'string.max': 'Alias cannot exceed 50 characters',
      'any.required': 'Alias is required',
    })
  });

  return schema.validate(data);
};
