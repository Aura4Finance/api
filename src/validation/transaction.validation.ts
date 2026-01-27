import { STATUS } from "@/constants/status.constant";
import { GetATransactionDto, GetTransactionMetrics } from "@/dto/transaction.dto";
import { APIError } from "@/utils/error-handler";
import Joi from "joi";

export const transactionQuerySchemaValidation = (raw: any) => {
    const data = { ...raw };

    if (typeof data.date === "string") {
        try {
            data.date = JSON.parse(data.date);
        } catch (e) {
            throw new APIError("Invalid JSON format for 'date' parameter", STATUS.bad );
        }
    }

    const schema = Joi.object({
        type: Joi.string().valid('PAYMENT', 'PAYOUT', 'REFUND'),
        status: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED'),
        token: Joi.string().valid('USDC', 'BTC', 'ETH', 'EUR', 'USD'),
        mode: Joi.string().valid("test", "live").optional(),
        date: Joi.object({
            type: Joi.string().valid('preset', 'range').required(),

            interval: Joi.when('type', {
                is: 'preset',
                then: Joi.string().valid(
                    'today','yesterday','last7days','last30days',
                    'thisMonth','lastMonth','thisYear'
                ).required(),
                otherwise: Joi.forbidden()
            }),

            startDate: Joi.when('type', {
                is: 'range',
                then: Joi.date().required(),
                otherwise: Joi.forbidden()
            }),

            endDate: Joi.when('type', {
                is: 'range',
                then: Joi.date().required(),
                otherwise: Joi.forbidden()
            })
        }),

        paymentLinkId: Joi.string(),
        paymentMethod: Joi.string().valid('PAYMENT_LINK', 'HOSTED_CHECKOUT'),
        customerId: Joi.string(),
        userId: Joi.string().optional(),
        limit: Joi.number().integer().positive().default(20),
        cursor: Joi.string(),
    });

    return schema.validate(data);
};


export const transactionIdSchemaValidation = (data: GetATransactionDto) => {
    const schema = Joi.object({
        txId: Joi.string().required(),
    });
    return schema.validate(data);
}

export const transactionModeSchemaValidation = (data: GetTransactionMetrics) => {
    const schema = Joi.object({
        mode: Joi.string().valid("test", "live").required(),
        status: Joi.valid("COMPLETED", "FAILED", "PENDING")
    })
    return schema.validate(data);
}