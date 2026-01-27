import { RetryCryptoPayoutDto } from "@/dto/payout.dto";
import Joi from "joi";

export const cryptoPayoutSchemaValidation = (data: any) => {
  const schema = Joi.object({
    walletAddress: Joi.string().optional(),
    bytes: Joi.string().optional(),
    signature: Joi.string().optional(),
    cryptoSettlementAccountId: Joi.string().optional(),
    save: Joi.boolean().optional(),
    amount: Joi.number().positive().required(),
  });
    return schema.validate(data);
};

export const retryCryptoPayoutValidation = (data: RetryCryptoPayoutDto) => {
    const schema = Joi.object({
      transactionId: Joi.string().required()
    });

    return schema.validate(data)
}

export const queryPayoutSchemaValidation = (data: any) => {
  const schema = Joi.object({
    status: Joi.string().valid('INITIALIZED', 'PROCESSING', 'COMPLETED', 'FAILED'),
    walletAddress: Joi.string(),
    method: Joi.string().valid('CRYPTO', 'FIAT'),
    txDigest: Joi.string(),
    minAmount: Joi.number().positive(),
    maxAmount: Joi.number().positive(),
    sortBy: Joi.string().valid('createdAt', 'amount', 'status'),
    sortOrder: Joi.string().valid('asc', 'desc'),
    cursor: Joi.string(),
    limit: Joi.number().integer().positive().default(20),
  });
    return schema.validate(data);
}