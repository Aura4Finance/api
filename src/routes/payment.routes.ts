import { RequestAuth } from "@/@types/request";
import { PaymentController } from "@/controllers/payment.controller";
import { checkIfUserIsDisabled, verifyApiKey, verifyPaylink } from "@/middlewares/user.milddleware";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const paymentController = Container.get(PaymentController);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) => 
    paymentController.retrievePaymentInformation(req, res)
)
)

router.use(verifyRequestBody);
router.post(
  "/",
  verifyApiKey,
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) =>
    paymentController.createPayment(req, res)
  )
);

router.post(
  "/paylink",
  verifyPaylink,
  asyncHandler((req: RequestAuth, res: Response) => 
    paymentController.createPayment(req, res)
  )
);

router.post(
  "/verify",
  asyncHandler((req: RequestAuth, res: Response) =>
    paymentController.verifyPayment(req, res)
  )
);

router.post(
  "/verify-transfer",
  asyncHandler((req: RequestAuth, res: Response) =>
    paymentController.verifyTransfer(req, res)
  )
);
export default router;
