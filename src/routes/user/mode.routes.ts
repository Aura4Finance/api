import { RequestAuth } from "@/@types/request";
import { ModeController } from "@/controllers/user/mode.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import { Container } from "typedi";

const router = express.Router();
const modeController = Container.get(ModeController);

router.post(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    modeController.handleModeSwitch(req, res)
  )
);

export default router;
