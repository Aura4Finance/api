import "reflect-metadata";
import express, { Response } from "express";
import Container from "typedi";
import { ApiKeyController } from "@/controllers/user/api-key.controller";
import { asyncHandler } from "@/utils/error-handler";
import { RequestAuth } from "@/@types/request";

const router = express.Router();
const apiKeyController = Container.get(ApiKeyController);

router.post(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    apiKeyController.generateApiKeys(req, res)
  )
);

router.post(
  "/regenerate",
  asyncHandler((req: RequestAuth, res: Response) =>
    apiKeyController.regenerateApiKeys(req, res)
  )
);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    apiKeyController.getApiKeys(req, res)
  )
);
export default router;
