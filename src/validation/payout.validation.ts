import { InitiatePayoutDto } from "@/dto/fiat.dto";
import { RetryCryptoPayoutDto } from "@/dto/payout.dto";
import Joi from "joi";

export const cryptoPayoutSchemaValidation = (data: any) => {
  const schema = Joi.object({
    network: Joi.valid("SUI").optional().messages({
      'any.only': 'Network must be SUI',
    }),
    amount: Joi.number().positive().min(0.01).max(1000000).required().messages({
      'number.positive': 'Payout amount must be greater than 0',
      'number.min': 'Minimum payout amount is 0.01',
      'number.max': 'Maximum payout amount is 1,000,000',
      'any.required': 'Amount is required',
    }),
    walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).optional().messages({
      'string.pattern.base': 'Wallet address must be a valid SUI address (0x followed by 64 hex characters)',
    }),
    cryptoSettlementAccountId: Joi.string().optional(),
    save: Joi.boolean().optional(),
    alias: Joi.string().max(50).optional().messages({
      'string.max': 'Wallet alias cannot exceed 50 characters',
    }),
  });
    return schema.validate(data);
};

export const retryCryptoPayoutValidation = (data: RetryCryptoPayoutDto) => {
    const schema = Joi.object({
      transactionId: Joi.string().required().messages({
        'any.required': 'Transaction ID is required for retry',
        }),
    });

    return schema.validate(data)
}

export const createFiatPayoutValidation = (data: InitiatePayoutDto) => {
    const schema = Joi.object({
        amount: Joi.number().positive().min(0.01).max(1000000).required().messages({
          'number.positive': 'Amount must be greater than 0',
          'number.min': 'Minimum payout amount is 0.01',
          'number.max': 'Maximum payout amount is 1,000,000',
          'any.required': 'Amount is required',
        }),
        accountId: Joi.string().optional(),
        bankCode: Joi.string().min(2).max(8).optional().messages({
          'string.min': 'Bank code must be at least 2 characters',
          'string.max': 'Bank code cannot exceed 8 characters',
        }),
        accountIdentifier: Joi.string().optional(),
        save: Joi.boolean().optional(),
    })
    return schema.validate(data);
}

export const queryPayoutSchemaValidation = (data: any) => {
  const schema = Joi.object({
    status: Joi.string().valid('INITIALIZED', 'PROCESSING', 'COMPLETED', 'FAILED').optional().messages({
      'any.only': 'Status must be one of: INITIALIZED, PROCESSING, COMPLETED, or FAILED',
    }),
    walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).optional().messages({
      'string.pattern.base': 'Wallet address must be a valid SUI address',
    }),
    method: Joi.string().valid('CRYPTO', 'FIAT').optional().messages({
      'any.only': 'Method must be either CRYPTO or FIAT',
    }),
    txDigest: Joi.string().optional(),
    minAmount: Joi.number().positive().optional().messages({
      'number.positive': 'Minimum amount must be greater than 0',
    }),
    maxAmount: Joi.number().positive().optional().messages({
      'number.positive': 'Maximum amount must be greater than 0',
    }),
    sortBy: Joi.string().valid('createdAt', 'amount', 'status').optional().messages({
      'any.only': 'Sort by must be one of: createdAt, amount, or status',
    }),
    sortOrder: Joi.string().valid('asc', 'desc').optional().messages({
      'any.only': 'Sort order must be either asc or desc',
    }),
    cursor: Joi.string().optional(),
    limit: Joi.number().integer().positive().default(20).max(100).messages({
      'number.positive': 'Limit must be a positive number',
      'number.max': 'Limit cannot exceed 100 items',
    }),
  });
    return schema.validate(data);
}
