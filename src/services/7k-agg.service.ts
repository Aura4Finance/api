import { Service } from "typedi";
import { APIError } from "@/utils/error-handler";
import logger from "@/utils/logger";
import { STATUS } from "@/constants/status.constant";
import { getCoinDecimal, getCoinType } from "@/constants/tokens.constants";
import { Mode, Token } from "@generated/prisma";
import { getTokenPrice, MetaAg, MetaQuote } from "@7kprotocol/sdk-ts";
import { Transaction, TransactionObjectArgument, coinWithBalance } from "@mysten/sui/transactions";

@Service()
export class SevenKAggService {
    private metaAg: MetaAg;

    constructor() {
        this.metaAg = new MetaAg();
    }
    /**
     * Retrieves the price of a token in USDC using the 7K protocol.
     * @param amount The amount of the token in USDC.
     * @param token The token for which to retrieve the price.
     * @param mode The mode (test or live).
     * @returns A promise resolving to the token price in USDC, or null if the price cannot be retrieved.
     */
    async getTokenPrice(amount: number, token: Token, mode: Mode): Promise<bigint | null> {
        const coinType = getCoinType(token, mode === "live" ? "mainnet" : "testnet");
        if (!coinType) {
            logger.error(`Coin type not found for token: ${token} and mode: ${mode}`);
            throw new APIError("Coin type not found", STATUS.notFound);
        }
        const rate = await getTokenPrice(coinType);
        if (!rate) {
            logger.error(`Token price not found for coin type: ${coinType}`);
            return null;
        }
        return BigInt(Math.floor(Number(amount / rate) * getCoinDecimal(token)));;
    }

    /**
     * Swaps tokens using the 7K protocol.
     * @param amount The amount of the input token to swap.
     * @param coinTypeIn The type of the input token.
     * @param coinTypeOut The type of the output token.
     * @param signer The address of the signer for the transaction.
     * @param tx The transaction object to which the swap will be added.
     * @returns A promise resolving to an object containing the output coin and the best quote, or null if the swap fails.
     */
    async swapTokens(
        amount: bigint, 
        coinTypeIn: string, 
        coinTypeOut: string,
        signer: string,
        tx: Transaction
    ): Promise<{
        coinOut: TransactionObjectArgument;
        bestQuote: MetaQuote;
    } | null> {
        try{
            let bestQuote: MetaQuote | undefined = undefined;
            const quotes = await this.metaAg.quote({
                amountIn: amount.toString(),
                coinTypeIn,
                coinTypeOut,
            });
    
            bestQuote = quotes.sort(
                (a, b) => Number(b.simulatedAmountOut || b.amountOut) - Number(a.simulatedAmountOut || a.amountOut),
            )[0];
    
            if(!bestQuote) {
                logger.error(`No quote found for fromCoinType: ${coinTypeIn} and toCoinType: ${coinTypeOut}`);
                return null;
            }
            // coinOut here is now the resulting USDC transaction object from the swap
            const coinOut = await this.metaAg.swap(
                {
                    quote: bestQuote,
                    signer,
                    coinIn: coinWithBalance({
                        balance: amount,
                        type: coinTypeIn,
                    }),
                    tx,
                },
                100,
            );
            return { coinOut, bestQuote };
        }catch(error: any) {
            logger.error(`7kAgg swapTokens failed: ${error.message}`);
            return null;
        }
    }
}
