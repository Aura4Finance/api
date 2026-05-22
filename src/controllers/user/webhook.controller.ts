import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import WEBHOOK_EVENT from "@/constants/webhook-events.constants";
import { WebhookService } from "@/services/user/webhook.service";
import { formatErrorValidation } from "@/utils/format-validation-error";
import {
  registerWebhhookValidation,
  retrieveWebhookDeliveriesValidation,
  subscribeToEventSchemaValidation,
} from "@/validation/webhook.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  async registerWebhook(req: RequestAuth, res: Response) {
    const businessProfileId = req.user.id;

    const { error, value } = registerWebhhookValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const { message, payload } = await this.webhookService.registerWebhook(
      value.url,
      businessProfileId
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getWebhookDetails(req: RequestAuth, res: Response) {
    const profileId = req.user.businessProfile.id;

    const { message, payload } = await this.webhookService.getWebhookDetails(
      profileId
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getWebhookEventTypes(_: RequestAuth, res: Response) {
    return res.status(STATUS.ok).json({
      success: true,
      message: "Webhook events fetched successfully",
      data: WEBHOOK_EVENT,
    });
  }

  async subscribeToEvent(req: RequestAuth, res: Response) {
    const profileId = req.user.businessProfile.id;

    const { error, value } = subscribeToEventSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const { message, payload } = await this.webhookService.addEventToWebhook(
      profileId,
      value.event
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async retrieveWebhookDeliveries(req: RequestAuth, res: Response) {
    const profileId = req.user.businessProfile.id;
    const { error, value } = retrieveWebhookDeliveriesValidation(req.query);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }
    const { message, payload } = await this.webhookService.getWebhookDeliveries(value, profileId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });

  }
}
