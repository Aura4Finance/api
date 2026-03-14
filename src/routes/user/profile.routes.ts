import { Container } from "typedi";
import express, { Response } from "express";
import { asyncHandler } from "@/utils/error-handler";
import { RequestAuth } from "@/@types/request";
import { ProfileController } from "@/controllers/user/profile.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";

const router = express.Router();
const profileController = Container.get(ProfileController);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    profileController.getProfile(req, res)
  )
);

router.get(
  "/metrics",
  asyncHandler((req: RequestAuth, res: Response) =>
    profileController.getProfileMetrics(req, res)
  )
);

router.post(
  "/request-email-change",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    profileController.changeEmail(req, res)
  )
);

router.post(
  "/verify-email-change",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    profileController.verifyEmailChange(req, res)
  )
);

export default router;
