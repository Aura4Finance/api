import { RefundController } from "@/controllers/refund.controller"
import { Container } from "typedi"
import express, { Response } from "express";
import { RequestAuth } from "@/@types/request";
import { asyncHandler } from "@/utils/error-handler";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { checkIfUserIsDisabled } from "@/middlewares/user.milddleware";

const refundController = Container.get(RefundController);

const router = express.Router()

router.use(
    verifyRequestBody,
    checkIfUserIsDisabled
);
router.post(
    "/:originalTxId",
    asyncHandler((req: RequestAuth, res: Response) =>
        refundController.initiateRefund(req, res))
)

router.post(
    "/:transactionId/retry",
    asyncHandler((req: RequestAuth, res: Response) =>
        refundController.retryRefund(req, res))
)


export default router;