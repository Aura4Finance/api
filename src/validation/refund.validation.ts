import { RefundDto, RetryRefundDto } from "@/dto/refund.dto";
import Joi from "joi";

export const refundQuerySchemaValidation = ( data: RefundDto) => {
    const schema = Joi.object({
    originalTxId: Joi.string().required(),
    to: Joi.string().max(66).min(66).required(),
    reason: Joi.string().optional(),
    });

    return schema.validate(data);
};

export const refundFilterSchemaValidation = ( data: any) => {
    const schema = Joi.object({
    status: Joi.string().valid('PENDING', 'INITIALIZED', 'COMPLETED', 'FAILED').optional(),
    walletAddress: Joi.string().optional(),
    customerId: Joi.string().optional(),
    txDigest: Joi.string().optional(),
    minAmount: Joi.number().optional(),
    maxAmount: Joi.number().optional(),
    sortBy: Joi.string().valid('amount', 'createdAt', 'status').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
    cursor: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).required(),
    });
    return schema.validate(data);
}

export const retryRefundSchemaValidation = (data: RetryRefundDto) => {
    const schema = Joi.object({
        transactionId: Joi.string().required()
    })
    return schema.validate(data)
}