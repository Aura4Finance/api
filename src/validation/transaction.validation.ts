import { STATUS } from "@/constants/status.constant";
import { TOKENS } from "@/constants/tokens.constants";
import { GetATransactionDto, GetTransactionMetrics } from "@/dto/transaction.dto";
import { APIError } from "@/utils/error-handler";
import Joi from "joi";

export const transactionQuerySchemaValidation = (raw: any) => {
    const data = { ...raw };

    if (typeof data.date === "string") {
        try {
            data.date = JSON.parse(data.date);
        } catch (e) {
          throw new APIError("Invalid date filter. Expected a JSON object.", STATUS.bad);
        }
    }

    const schema = Joi.object({
        type: Joi.string().valid('PAYMENT', 'PAYOUT', 'REFUND').optional().messages({
          'any.only': 'Type must be one of: PAYMENT, PAYOUT, or REFUND',
        }),
        status: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED').optional().messages({
          'any.only': 'Status must be one of: PENDING, COMPLETED, or FAILED',
        }),
        token: Joi.string().valid(...Object.values(TOKENS).map(token => token.symbol)).optional().messages({
          'any.only': 'Invalid token',
        }),
        mode: Joi.string().valid("test", "live").optional().messages({
          'any.only': 'Mode must be either "test" or "live"',
        }),
        date: Joi.object({
            type: Joi.string().valid('preset', 'range').required().messages({
              'any.only': 'Date type must be either "preset" or "range"',
              'any.required': 'Date type is required if date is specified',
            }),

            interval: Joi.when('type', {
                is: 'preset',
                then: Joi.string().valid(
                    'today', 'yesterday', 'last7days', 'last30days',
                    'thisMonth', 'lastMonth', 'thisYear'
                ).required().messages({
                  'any.only': 'Interval must be one of: today, yesterday, last7days, last30days, thisMonth, lastMonth, thisYear',
                  'any.required': 'Interval is required for preset date type',
                }),
                otherwise: Joi.forbidden()
            }),

            startDate: Joi.when('type', {
                is: 'range',
                then: Joi.date().required().messages({
                  'date.base': 'Start date must be a valid date',
                  'any.required': 'Start date is required for range date type',
                }),
                otherwise: Joi.forbidden()
            }),

            endDate: Joi.when('type', {
                is: 'range',
                then: Joi.date().required().messages({
                  'date.base': 'End date must be a valid date',
                  'any.required': 'End date is required for range date type',
                }),
                otherwise: Joi.forbidden()
            })
        }).optional(),

        paymentLinkId: Joi.string().optional(),
        paymentMethod: Joi.string().valid('PAYMENT_LINK', 'HOSTED_CHECKOUT').optional().messages({
          'any.only': 'Payment method must be either PAYMENT_LINK or HOSTED_CHECKOUT',
        }),
        customerId: Joi.string().optional(),
        userId: Joi.string().optional(),
        currency: Joi.string().length(3).uppercase().optional().messages({
          'string.length': 'Currency must be a 3-letter code',
        }),
        network: Joi.valid("SUI").optional().messages({
          'any.only': 'Network must be SUI',
        }),
        limit: Joi.number().integer().positive().default(20).max(100).messages({
          'number.positive': 'Limit must be a positive number',
          'number.max': 'Limit cannot exceed 100 items',
        }),
        cursor: Joi.string().optional(),
    });

    return schema.validate(data);
};

export const transactionIdSchemaValidation = (data: GetATransactionDto) => {
    const schema = Joi.object({
        txId: Joi.string().required().messages({
          'any.required': 'Transaction ID is required',
        }),
    });
    return schema.validate(data);
}

export const transactionModeSchemaValidation = (data: GetTransactionMetrics) => {
    const schema = Joi.object({
        mode: Joi.string().valid("test", "live").optional().messages({
          'any.only': 'Mode must be either "test" or "live"',
        }),
        status: Joi.string().valid("COMPLETED", "FAILED", "PENDING").optional().messages({
          'any.only': 'Status must be one of: COMPLETED, FAILED, or PENDING',
        })
    })
    return schema.validate(data);
}

export const queryDashboardSchemaValidation = (data: any) => {
    const schema = Joi.object({
        mode: Joi.string().valid("test", "live").optional().messages({
          'any.only': 'Mode must be either "test" or "live"',
        }),
    })
    return schema.validate(data);
}
