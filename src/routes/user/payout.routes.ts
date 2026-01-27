import { Container } from "typedi";
import { asyncHandler } from "@/utils/error-handler";
import express, {Response} from "express";
import { RequestAuth } from "@/@types/request";
import { PayoutController } from "@/controllers/payout.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";

const payOutController = Container.get(PayoutController);
const router = express.Router();

router.get(
    "/balances",
    asyncHandler((req: RequestAuth, res: Response) =>
        payOutController.getBalances(req, res))
)
router.use(verifyRequestBody);
router.post(
    "/crypto",
    asyncHandler((req: RequestAuth, res: Response) =>
        payOutController.cryptoPayout(req, res))
);

router.post(
    "/crypto/retry",
    asyncHandler((req: RequestAuth, res: Response) => 
        payOutController.retryCryptoPayout(req, res)
    )
)

export default router;
