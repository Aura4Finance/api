import { RequestAuth } from "@/@types/request";
import { PaymentController } from "@/controllers/payment.controller";
import {
  paymentCreationRateLimitMiddleware,
  paymentIdempotencyMiddleware,
} from "@/middlewares/payment.middleware";
import { checkIfUserIsDisabled, verifyApiKey, verifyPaylink } from "@/middlewares/user.milddleware";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const paymentController = Container.get(PaymentController);

router.get(
  "/:paymentId",
  asyncHandler((req: RequestAuth, res: Response) => 
    paymentController.retrievePaymentInformation(req, res)
)
)

router.post(
  "/",
  paymentCreationRateLimitMiddleware,
  verifyApiKey,
  paymentIdempotencyMiddleware,
  verifyRequestBody,
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) =>
    paymentController.createPayment(req, res)
  )
);

router.post(
  "/paylink",
  paymentCreationRateLimitMiddleware,
  paymentIdempotencyMiddleware,
  verifyRequestBody,
  verifyPaylink,
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) => 
    paymentController.createPayment(req, res)
  )
);

router.patch(
  "/:paymentId",
  asyncHandler((req: RequestAuth, res: Response) => 
    paymentController.updatePaymentIntent(req, res)
  )
)

router.post(
  "/:paymentId/verify",
  asyncHandler((req: RequestAuth, res: Response) =>
    paymentController.verifyPayment(req, res)
  )
);

router.post(
  "/:paymentId/verify-transfer",
  asyncHandler((req: RequestAuth, res: Response) =>
    paymentController.verifyTransfer(req, res)
  )
);
export default router;
