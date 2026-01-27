import { RequestAuth } from "@/@types/request";
import { WebhookController } from "@/controllers/user/webhook.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const webhookController = Container.get(WebhookController);

router.post(
  "/register",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    webhookController.registerWebhook(req, res)
  )
);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    webhookController.getWebhookDetails(req, res)
  )
);

router.get(
  "/events",
  asyncHandler((req: RequestAuth, res: Response) =>
    webhookController.getWebhookEventTypes(req, res)
  )
);

router.get(
  "/deliveries",
  asyncHandler((req: RequestAuth, res: Response) => 
    webhookController.retrieveWebhookDeliveries(req, res)
  )
)

router.post(
  "/subscribe",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    webhookController.subscribeToEvent(req, res)
  )
);

export default router;
