import { STATUS } from "@/constants/status.constant";
import { RegisterWebhookDto, subscribeToEventDto } from "@/dto/webhook.dto";
import { APIError } from "@/utils/error-handler";
import Joi from "joi";

export const registerWebhhookValidation = (data: RegisterWebhookDto) => {
  const schema = Joi.object({
    url: Joi.string().uri({ scheme: ['http', 'https'] }).required().messages({
      'string.uri': 'Please provide a valid webhook URL starting with http:// or https://',
      'any.required': 'Webhook URL is required',
    }),
  });

  return schema.validate(data);
};

export const subscribeToEventSchemaValidation = (data: subscribeToEventDto) => {
  const schema = Joi.object({
    event: Joi.string().valid("payment.failed", "payment.success").required().messages({
      'any.only': 'Event must be either "payment.failed" or "payment.success"',
      'any.required': 'Event is required',
    }),
  });

  return schema.validate(data);
};

export const retrieveWebhookDeliveriesValidation = (raw: any) => {
      const data = { ...raw };
      if (typeof data.date === "string") {
          try {
              data.date = JSON.parse(data.date);
          } catch (e) {
              throw new APIError("Invalid date filter. Expected a JSON object.", STATUS.bad );
          }
      }
  const schema = Joi.object({
    status: Joi.string().valid("PENDING", "COMPLETED", "FAILED").optional().messages({
      'any.only': 'Status must be one of: PENDING, COMPLETED, or FAILED',
    }),
    transactionId: Joi.string().optional(),
    event: Joi.string().valid("payment.failed", "payment.success").optional().messages({
      'any.only': 'Event must be either "payment.failed" or "payment.success"',
    }),
    limit: Joi.number().integer().min(1).max(100).optional().messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100 items',
    }),
    date: Joi.object({
      startDate: Joi.date().optional().messages({
        'date.base': 'Start date must be a valid date',
      }),
      endDate: Joi.date().optional().messages({
        'date.base': 'End date must be a valid date',
      }),
    }).optional(),
  });

  return schema.validate(data);
};