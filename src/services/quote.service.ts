import { Service } from "typedi";
import { SevenKAggService } from "./7k-agg.service";
import { CetusService } from "./cetus.service";
import { STATUS } from "@/constants/status.constant";
import { APIError } from "@/utils/error-handler";
import { Token, Mode } from "../../generated/prisma";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import logger from "@/utils/logger";
import { HopService } from "./hop.service";

@Service()
export class QuoteService {
    constructor(
        private sevenKAggService: SevenKAggService,
        private cetusService: CetusService,
        private hopService: HopService
    ) {}
    /**
     * Retrieves the price of a token in USDC.
     * @param amountInUSDC The amount of the token in USDC.
     * @param token The token for which to retrieve the price.
     * @param mode The mode (test or live).
     * @returns A promise resolving to the token price in USDC.
     */
    async getTokenPrice(amountInUSDC: number, token: Token, mode: Mode): Promise<bigint> {
        if(token === "USDC"){
            throw new APIError("Input token cannot be USDC!", STATUS.bad);
        }
        const cetus = await this.cetusService.getTokenPrice(amountInUSDC, token, mode);
        if (cetus) return cetus;

        logger.warn("Cetus couldn't resolve token price, falling back to hop");

        const hop = await this.hopService.getTokenPrice(amountInUSDC, token, mode);
        if (hop) return hop;

        logger.warn("Hop couldn't resolve token price, falling back to 7K");
        const sevenK = await this.sevenKAggService.getTokenPrice(amountInUSDC, token, mode);
        if (sevenK) return sevenK;
  
        logger.error("Both 7K and Cetus failed to resolve token price");
        throw new APIError("Couldn't resolve price for selected token", STATUS.serverUnavailable);
      }

       async swap(
        totalAmount: bigint,
        coinTypeIn: string,
        coinTypeOut: string,
        coinObjectId: string,
        signer: string,
        tx: Transaction
      ): Promise<{ coinOut: TransactionObjectArgument; amountOut: string }> {
        const cetus = await this.cetusService.swapTokens(
          totalAmount,
          coinTypeIn,
          coinTypeOut,
          tx.object(coinObjectId),
          tx
        );
      
        if (cetus) {
          return {
            coinOut: cetus.coinOut,
            amountOut: cetus.bestQuote.amountOut,
          };
        }
        logger.warn("Cetus couldn't find a swap route, falling back to hop");

          const hop = await this.hopService.swapTokens(
            totalAmount,
            coinTypeIn,
            coinTypeOut,
            tx.object(coinObjectId),
            signer,
            tx
          );

          if(hop) {
            return {
                coinOut: hop.coinOut,
                amountOut: String(hop.bestQuote.amount_out),
            }
          }
          logger.warn("Hop couldn't find a swap route, falling back to 7K");

        const sevenKAgg = await this.sevenKAggService.swapTokens(
          totalAmount,
          coinTypeIn,
          coinTypeOut,
          signer,
          tx
        );
      
        if (sevenKAgg) {
          return {
            coinOut: sevenKAgg.coinOut,
            amountOut: sevenKAgg.bestQuote.amountOut,
          };
        }
        logger.error("Both 7K and Cetus failed to find a swap route");
        throw new APIError("Failed to swap token: no route found via 7K or Cetus", STATUS.serverError);
      }
    
}