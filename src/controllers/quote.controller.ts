import { QuoteService } from "@/services/quote.service";
import { Mode, Token } from "@/generated/prisma/client";
import { Service } from "typedi";
import { getTokenPriceValidation } from "@/validation/quote.validation";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { Request, Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { getCoinDecimal } from "@/constants/tokens.constants";
import { decimalToBigInt } from "@/utils/decimal-to-big-int";


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

        // Convert to Number to allow fractional division, then force 2 decimal places
        const calculatedPrice = Number(quotePrice / decimalToBigInt(1, getCoinDecimal(body.token)));

        return res.status(STATUS.ok).json({
            success: true,
            message: "Token price retrieved successfully!",
            data: {
                price: calculatedPrice.toFixed(2), // Ensures "20.23" or "20.00"
                timeStamp: new Date().toISOString(),
            },
        });
    }
}
