import { Service } from "typedi";
import { RefundServices } from "@/services/refund.service";
import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { refundQuerySchemaValidation, retryRefundSchemaValidation } from "@/validation/refund.validation";
import { STATUS } from "@/constants/status.constant";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { RefundDto, RetryRefundDto } from "@/dto/refund.dto";
import { Mode } from "../../generated/prisma";
import { UserService } from "@/services/user/user.service";

@Service()
export class RefundController {
    constructor(
        private readonly refundService: RefundServices,
        private readonly userService: UserService
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
        let mode: Mode;
        if (req.mode) {
            mode = req.mode
        } else {
            const profile = await this.userService.getUserById(userId);
            mode = profile?.businessProfile?.isLive ? "live" : "test";
        }
        const { message, payload } = await this.refundService.initiateRefund(
            to,
            reason as string,
            originalTxId,
            userId,
            mode
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
        let mode: Mode;
        if (req.mode) {
            mode = req.mode
        } else {
            const profile = await this.userService.getUserById(userId);
            mode = profile?.businessProfile?.isLive ? "live" : "test";
        }
        const { message, payload } = await this.refundService.retryRefund(transactionId, userId, mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }
}