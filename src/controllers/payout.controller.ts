import { Service } from "typedi";
import { PayoutService } from "@/services/payout.service";
import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { Response } from "express";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { createFiatPayoutValidation, cryptoPayoutSchemaValidation, retryCryptoPayoutValidation } from "@/validation/payout.validation";
import { CryptoPayOutDto, RetryCryptoPayoutDto } from "@/dto/payout.dto";
import { InitiatePayoutDto } from "@/dto/fiat.dto";
import { Wallet } from "../../generated/prisma";

@Service()
export class PayoutController {
    constructor(
        private readonly payoutService: PayoutService
    ) { }

    async getBalances(req: RequestAuth, res: Response) {
        const merchantWalletAddress = req.user?.businessProfile.wallet[0]?.address as string;
        const { message, payload } = await this.payoutService.getBalances(merchantWalletAddress, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async cryptoPayout(req: RequestAuth, res: Response) {
        const merchantWallet = req.user?.businessProfile.wallet[0] as Wallet;
        const profileId = req.user?.businessProfile.id as string
        const { error, value } = cryptoPayoutSchemaValidation(req.body);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const body: CryptoPayOutDto = value;
        const { message, payload } = await this.payoutService.initiateCryptoPayout(body, merchantWallet, profileId, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async retryPayout(req: RequestAuth, res: Response) {
        const profileId = req.user?.businessProfile.id as string;
        const merchantWallet = req.user?.businessProfile.wallet[0] as Wallet;
        const { error, value } = retryCryptoPayoutValidation(req.params as any);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }

        const { transactionId }: RetryCryptoPayoutDto = value;
        const { message, payload } = await this.payoutService.retryPayout(transactionId, profileId, merchantWallet, req.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async createFiatPayout(req: RequestAuth, res: Response) {
        const profileId = req.user?.businessProfile.id as string;
        const merchantWallet = req.user?.businessProfile.wallet[0] as Wallet;
        const { error, value } = createFiatPayoutValidation(req.body);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const body = value as InitiatePayoutDto;
        const { message, payload } = await this.payoutService.initiateFiatPayout(profileId, merchantWallet, body, req.mode);

        return res.status(STATUS.created).json({
            success: true,
            message,
            data: payload,
        });
    }
}