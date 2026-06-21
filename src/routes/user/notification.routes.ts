import { RequestAuth } from "@/@types/request";
import { NotificationController } from "@/controllers/user/notification.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import { Container } from "typedi";

const router = express.Router();
const notificationController = Container.get(NotificationController);

router.post(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    notificationController.toggleEmailNotification(req, res)
  )
);

export default router;
