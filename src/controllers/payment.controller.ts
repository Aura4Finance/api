import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import {
  CreatePaymentDto,
  RetrievePaymentInformationDto,
  VerifyPaymentDto
} from "@/dto/payment.dto";
import { PaymentService } from "@/services/payment.service";
import { formatErrorValidation } from "@/utils/format-validation-error";
import {
  createPaymentValidation,
  verifyPaymentValidation,
  verifyPaymentInformationRetrievalValidation,
  updatePaymentIntentValidation
} from "@/validation/payment.validation";
import { Response } from "express";
import { Service } from "typedi";
import { Paylink, PaymentMethod } from "../../generated/prisma";
import { redisClient } from "@/middlewares/rate-limit.middleware";

@Service()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService

  ) { }

  async createPayment(req: RequestAuth, res: Response) {
    const { error, value } = createPaymentValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: CreatePaymentDto = value as CreatePaymentDto;
    body.type = req.type as PaymentMethod;
    if (req.payLink) {
      body.payLink = req.payLink as Paylink;
    }
    const userId = req.user.id as string;

    const { message, payload } = await this.paymentService.createPayment(body, userId, req.mode);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async updatePaymentIntent(req: RequestAuth, res: Response) {
    const { error, value } = verifyPaymentValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }
    const { paymentId } = value as { paymentId: string };
    const { value: intentValue } = updatePaymentIntentValidation(req.query);

    let intent: "transfer_address" | "deposit_address" = intentValue.intent;
    if (!intent) intent = "transfer_address";

    if (intent == "deposit_address") {
      const { message, payload } = await this.paymentService.generateDepositAddressForPaymentCompletion(paymentId);
      return res.status(STATUS.ok).json({
        success: true,
        message,
        data: payload,
      });
    } else {
      const { message, payload } = await this.paymentService.generateTransferAddressForPaymentCompletiion(paymentId);
      return res.status(STATUS.ok).json({
        success: true,
        message,
        data: payload,
      });
    }


  }

  async verifyTransfer(req: RequestAuth, res: Response) {
    const { error, value } = verifyPaymentValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: VerifyPaymentDto = value as VerifyPaymentDto;
    const { message, payload } = await this.paymentService.verifyTransfer(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    });
  }

  async verifyPayment(req: RequestAuth, res: Response) {
    const { error, value } = verifyPaymentValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: VerifyPaymentDto = value as VerifyPaymentDto;
    // const userId = req.userId as string;

    const { message, payload } = await this.paymentService.verifyPayment(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async retrievePaymentInformation(req: RequestAuth, res: Response) {
    const { error, value } = verifyPaymentInformationRetrievalValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const payment: RetrievePaymentInformationDto = value as RetrievePaymentInformationDto;
    const cachedData = await redisClient.get(payment.paymentId);
    const tx = cachedData ? JSON.parse(cachedData) : null;


    if (!tx) {
      return res.status(STATUS.requestTimeout).json({
        success: false,
        message: "Payment session expired. Please start a new payment."
      })
    }
    tx.redirectUrl = `${tx.redirectUrl}?oratx=${payment.paymentId}`
    return res.status(STATUS.ok).json({
      success: true,
      message: "Payment information retrieved successfully!",
      data: tx
    })
  }
}
