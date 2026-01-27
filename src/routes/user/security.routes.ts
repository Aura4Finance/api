import { RequestAuth } from "@/@types/request";
import { SecurityController } from "@/controllers/user/security.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const securityController = Container.get(SecurityController);

router.post(
  "/change-password",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    securityController.changePassword(req, res)
  )
);

router.post(
  "/complete-password-change",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    securityController.completePasswordChange(req, res)
  )
);

export default router;
