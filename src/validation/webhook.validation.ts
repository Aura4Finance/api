import { STATUS } from "@/constants/status.constant";
import { RegisterWebhookDto, subscribeToEventDto } from "@/dto/webhook.dto";
import { APIError } from "@/utils/error-handler";
import Joi from "joi";

export const registerWebhhookValidation = (data: RegisterWebhookDto) => {
  const schema = Joi.object({
    url: Joi.string().uri().required(),
  });

  return schema.validate(data);
};

export const subscribeToEventSchemaValidation = (data: subscribeToEventDto) => {
  const schema = Joi.object({
    event: Joi.string().valid("payment.failed", "payment.success").required(),
  });

  return schema.validate(data);
};

export const retrieveWebhookDeliveriesValidation = (raw: any) => {
      const data = { ...raw };
      if (typeof data.date === "string") {
          try {
              data.date = JSON.parse(data.date);
          } catch (e) {
              throw new APIError("Invalid JSON format for 'date' parameter", STATUS.bad );
          }
      }
  const schema = Joi.object({
    status: Joi.string().valid("PENDING", "COMPLETED", "FAILED"),
    transactionId: Joi.string(),
    event: Joi.string().valid("payment.failed", "payment.success"),
    limit: Joi.number().integer().min(1).optional(),
    date: Joi.object({
      startDate: Joi.date().optional(),
      endDate: Joi.date().optional(),
    }).optional(),
  });

  return schema.validate(data);
};