import { RefundDto, RetryRefundDto } from "@/dto/refund.dto";
import Joi from "joi";

export const refundQuerySchemaValidation = ( data: RefundDto) => {
    const schema = Joi.object({
    originalTxId: Joi.string().required().messages({
      'any.required': 'Original transaction ID is required',
    }),
    to: Joi.string().length(66).pattern(/^0x[a-fA-F0-9]{64}$/).required().messages({
      'string.length': 'Wallet address must be exactly 66 characters',
      'string.pattern.base': 'Wallet address must be a valid SUI address (0x followed by 64 hex characters)',
      'any.required': 'Wallet address is required',
    }),
    reason: Joi.string().max(200).optional().messages({
      'string.max': 'Reason cannot exceed 200 characters',
    }),
    });

    return schema.validate(data);
};

export const refundFilterSchemaValidation = ( data: any) => {
    const schema = Joi.object({
    status: Joi.string().valid('PENDING', 'INITIALIZED', 'COMPLETED', 'FAILED').optional().messages({
      'any.only': 'Status must be one of: PENDING, INITIALIZED, COMPLETED, or FAILED',
    }),
    walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).optional().messages({
      'string.pattern.base': 'Wallet address must be a valid SUI address',
    }),
    customerId: Joi.string().optional(),
    txDigest: Joi.string().optional(),
    minAmount: Joi.number().positive().optional().messages({
      'number.positive': 'Minimum amount must be greater than 0',
    }),
    maxAmount: Joi.number().positive().optional().messages({
      'number.positive': 'Maximum amount must be greater than 0',
    }),
    sortBy: Joi.string().valid('amount', 'createdAt', 'status').optional().messages({
      'any.only': 'Sort by must be one of: amount, createdAt, or status',
    }),
    sortOrder: Joi.string().valid('asc', 'desc').optional().messages({
      'any.only': 'Sort order must be either asc or desc',
    }),
    cursor: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).required().messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100 items',
      'any.required': 'Limit is required',
    }),
    });
    return schema.validate(data);
}

export const retryRefundSchemaValidation = (data: RetryRefundDto) => {
    const schema = Joi.object({
        transactionId: Joi.string().required().messages({
          'any.required': 'Transaction ID is required for refund retry',
        })
    })
    return schema.validate(data)
}