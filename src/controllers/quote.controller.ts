import { QuoteService } from "@/services/quote.service";
import { Mode, Token } from "@/generated/prisma/client";
import { Service } from "typedi";
import { getTokenPriceValidation } from "@/validation/quote.validation";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { Request, Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { getCoinDecimal } from "@/constants/tokens.constants";
import { bigIntToDecimal } from "@/utils/decimal-to-big-int";


@Service()
export class QuoteController {
    constructor(private quoteService: QuoteService) { }

    async getTokenPrice(req: Request, res: Response) {
        const { error, value } = getTokenPriceValidation(req.query);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }

        const body = value as { amountInUSDC: number, token: Token, mode: Mode };
        const quotePrice = await this.quoteService.getTokenPrice(body.amountInUSDC, body.token, body.mode);

        return res.status(STATUS.ok).json({
            success: true,
            message: "Token price retrieved successfully!",
            data: {
                // 4. Use Decimal's native .toFixed(2) for the final response string
                price: bigIntToDecimal(quotePrice, getCoinDecimal(body.token), 2),
                timeStamp: new Date().toISOString(),
            },
        });
    }
}
