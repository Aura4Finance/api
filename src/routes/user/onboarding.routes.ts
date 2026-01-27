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

export default router;
