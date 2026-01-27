import { Container } from "typedi";
import { asyncHandler } from "@/utils/error-handler";
import express, {Response} from "express";
import { RequestAuth } from "@/@types/request";
import { TransactionController } from "@/controllers/transaction.controller";
import payoutRoutes from "./payout.routes";
import refundRoutes from "./refund.routes";

const transactionController = Container.get(TransactionController);

const router = express.Router();
router.use("/payout", payoutRoutes);
router.use("/refund", refundRoutes);

router.get("/:txId",
    asyncHandler((req: RequestAuth, res: Response) =>
        transactionController.getTransactionById(req, res))
);

router.get("/",
    asyncHandler((req: RequestAuth, res: Response) =>
        transactionController.getAllTransactions(req, res))
);
export default router;