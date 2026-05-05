import { Service } from "typedi";
import { PayoutService } from "@/services/payout.service";
import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { Response } from "express";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { createFiatPayoutValidation, cryptoPayoutSchemaValidation, retryCryptoPayoutValidation } from "@/validation/payout.validation";
import { CryptoPayOutDto, RetryCryptoPayoutDto } from "@/dto/payout.dto";
import { InitiatePayoutDto } from "@/dto/fiat.dto";

@Service()
export class PayoutController {
    constructor(
        private readonly payoutService: PayoutService
    ) { }

    async getBalances(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { message, payload } = await this.payoutService.getBalances(userId, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async cryptoPayout(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { error, value } = cryptoPayoutSchemaValidation(req.body);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const body: CryptoPayOutDto = value;
        const { message, payload } = await this.payoutService.initiateCryptoPayout(body, userId, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async retryCryptoPayout(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { error, value } = retryCryptoPayoutValidation(req.params as any);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }

        const { transactionId }: RetryCryptoPayoutDto = value;
        const { message, payload } = await this.payoutService.retryCryptoPayout(transactionId, userId, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async createFiatPayout(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { error, value } = createFiatPayoutValidation(req.body);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const body = value as InitiatePayoutDto;
        const { message, payload } = await this.payoutService.initiateFiatPayout(userId, req.mode, body);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async retryFiatPayout(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { error, value } = retryCryptoPayoutValidation(req.body);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const { transactionId }: RetryCryptoPayoutDto = value;
        const { message, payload } = await this.payoutService.retryFiatPayout(transactionId, userId, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }
}