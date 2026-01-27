import { RequestAuth } from "@/@types/request";
import { SettlementController } from "@/controllers/user/settlement.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const settlementController = Container.get(SettlementController);

router.post(
  "/",
  verifyRequestBody,
  asyncHandler((req: RequestAuth, res: Response) =>
    settlementController.addSettlementAccount(req, res)
  )
);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    settlementController.getAllSettlementAccounts(req, res)
  )
);

router.delete("/:id", 
  asyncHandler((req: RequestAuth, res: Response) => 
    settlementController.deleteSettlementAccount(req, res)
));


export default router;
