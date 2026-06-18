import { Service } from "typedi";
import { SevenKAggService } from "./7k-agg.service";
import { CetusService } from "./cetus.service";
import { STATUS } from "@/constants/status.constant";
import { APIError } from "@/utils/error-handler";
import { Token, Mode } from "../../generated/prisma";
import logger from "@/utils/logger";

@Service()
export class QuoteService {
    constructor(
        private sevenKAggService: SevenKAggService,
        private cetusService: CetusService
    ) {}
    /**
     * Retrieves the price of a token in USDC.
     * @param amountInUSDC The amount of the token in USDC.
     * @param token The token for which to retrieve the price.
     * @param mode The mode (test or live).
     * @returns A promise resolving to the token price in USDC.
     */
    async getTokenPrice(amountInUSDC: number, token: Token, mode: Mode): Promise<bigint> {
        const sevenK = await this.sevenKAggService.getTokenPrice(amountInUSDC, token, mode);
        if (sevenK) return sevenK;
    
        logger.warn("7K couldn't resolve token price, falling back to Cetus");
        const cetus = await this.cetusService.getTokenPrice(amountInUSDC, token, mode);
        if (cetus) return cetus;
    
        logger.error("Both 7K and Cetus failed to resolve token price");
        throw new APIError("Couldn't resolve price for selected token", STATUS.serverUnavailable);
      }
    
}