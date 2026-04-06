import { Service } from "typedi";
import { PayoutService } from "@/services/payout.service";
import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { Response } from "express";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { cryptoPayoutSchemaValidation, retryCryptoPayoutValidation } from "@/validation/payout.validation";
import { CryptoPayOutDto, RetryCryptoPayoutDto } from "@/dto/payout.dto";
import { UserService } from "@/services/user/user.service";
import { Mode } from "../../generated/prisma";

@Service()
export class PayoutController {
    constructor(
        private readonly payoutService: PayoutService,
        private readonly userService: UserService,
    ) { }

    async getBalances(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        let mode: Mode;
        if (req.mode) {
            mode = req.mode
        } else {
            const profile = await this.userService.getUserById(userId);
            mode = profile?.businessProfile?.isLive ? "live" : "test";
        }

        const { message, payload } = await this.payoutService.getBalances(userId, mode);

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
                let mode: Mode;
        if (req.mode) {
            mode = req.mode
        } else {
            const profile = await this.userService.getUserById(userId);
            mode = profile?.businessProfile?.isLive ? "live" : "test";
        }
        const { message, payload } = await this.payoutService.initiateCryptoPayout(body, userId, mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }

    async retryCryptoPayout(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { error, value } = retryCryptoPayoutValidation(req.body);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }

        const { transactionId }: RetryCryptoPayoutDto = value;
        let mode: Mode;
        if (req.mode) {
            mode = req.mode
        } else {
            const profile = await this.userService.getUserById(userId);
            mode = profile?.businessProfile?.isLive ? "live" : "test";
        }
        const { message, payload } = await this.payoutService.retryCryptoPayout(transactionId, userId, mode);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
    }
}