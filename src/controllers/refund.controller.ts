import { Service } from "typedi";
import { RefundServices } from "@/services/refund.service";
import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { refundQuerySchemaValidation, retryRefundSchemaValidation } from "@/validation/refund.validation";
import { STATUS } from "@/constants/status.constant";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { RefundDto, RetryRefundDto } from "@/dto/refund.dto";
import { Wallet } from "../../generated/prisma";

@Service()
export class RefundController {
    constructor(
        private readonly refundService: RefundServices,
    ) { }

    async initiateRefund(req: RequestAuth, res: Response) {
        const profileId = req.user?.businessProfile.id;
        const wallet = req.user?.businessProfile.wallet[0];
        const { error, value } = refundQuerySchemaValidation({
            ...req.body,
            ...req.params,
        });
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const { originalTxId, reason, to }: RefundDto = value;
        const { message, payload } = await this.refundService.initiateRefund(
            to,
            <string>reason,
            originalTxId,
            <Wallet>wallet,
            <string>profileId,
            req.mode
        );
        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async retryRefund(req: RequestAuth, res: Response) {
        const profileId = req.user?.businessProfile.id;
        const wallet = req.user?.businessProfile.wallet[0];
        const { error, value } = retryRefundSchemaValidation(req.params as any);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const { transactionId }: RetryRefundDto = value;
        const { message, payload } = await this.refundService.retryRefund(
            transactionId, 
            <Wallet>wallet,
            <string>profileId, 
            req.mode
        );

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }
}