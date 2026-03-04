import { RequestAuth } from "@/@types/request";
import { UserController } from "@/controllers/user/user.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const userController = Container.get(UserController);

router.post(
  "/",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    userController.onboardUser(req, res)
  )
);

router.post(
  "/2fa/setup",
  asyncHandler((req: RequestAuth, res: Response) =>
    userController.setup2FA(req, res)
  )
);

router.post(
  "/2fa/verify",
  asyncHandler((req: RequestAuth, res: Response) =>
    userController.verify2FA(req, res)
  )
);

export default router;