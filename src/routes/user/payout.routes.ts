import { Container } from "typedi";
import { asyncHandler } from "@/utils/error-handler";
import express, {Response} from "express";
import { RequestAuth } from "@/@types/request";
import { PayoutController } from "@/controllers/payout.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { checkIfUserIsDisabled } from "@/middlewares/user.milddleware";

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
    checkIfUserIsDisabled,
    asyncHandler((req: RequestAuth, res: Response) =>
        payOutController.cryptoPayout(req, res))
);

router.post(
    "/crypto/:transactionId/retry",
    checkIfUserIsDisabled,
    asyncHandler((req: RequestAuth, res: Response) => 
        payOutController.retryCryptoPayout(req, res)
    )
)

router.post(
    "/fiat",
    checkIfUserIsDisabled,
    asyncHandler((req: RequestAuth, res: Response) =>
        payOutController.createFiatPayout(req, res)
    )
)

router.post(
    "/fiat/:transactionId/retry",
    checkIfUserIsDisabled,
    asyncHandler((req: RequestAuth, res: Response) =>
        payOutController.retryFiatPayout(req, res)
    )
)

export default router;
