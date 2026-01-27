import { Service } from "typedi";
import { RefundServices } from "@/services/refund.service";
import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { refundQuerySchemaValidation, retryRefundSchemaValidation } from "@/validation/refund.validation";
import { STATUS } from "@/constants/status.constant";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { RefundDto, RetryRefundDto } from "@/dto/refund.dto";

@Service()
export class RefundController {
    constructor(
        private readonly refundService: RefundServices,
    ) { }

    async initiateRefund(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { error, value } = refundQuerySchemaValidation(req.body);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const { originalTxId, reason, to }: RefundDto = value;
        const { message, payload } = await this.refundService.initiateRefund(
            to,
            reason as string,
            originalTxId,
            userId,
        );
        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async retryRefund(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;

        const { error, value } = retryRefundSchemaValidation(req.body);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const { transactionId }: RetryRefundDto = value;
        const { message, payload } = await this.refundService.retryRefund(transactionId, userId);
        
        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }
}