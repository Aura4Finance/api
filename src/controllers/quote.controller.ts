import { QuoteService } from "@/services/quote.service";
import { Mode, Token } from "../../generated/prisma";
import { Service } from "typedi";
import { getTokenPriceValidation } from "@/validation/quote.validation";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { Request, Response } from "express";
import { STATUS } from "@/constants/status.constant";

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
            return quotePrice.toString();
        }
    }
