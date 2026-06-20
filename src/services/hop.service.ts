import { Service } from "typedi";
import logger from "@/utils/logger";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { HopApi, QuoteResponse } from "@hop.ag/sdk";
import { Mode, Token } from "../../generated/prisma";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { getCoinType, getCoinDecimal } from "@/constants/tokens.constants";

@Service()
export class HopService {
    private hopApi!: HopApi;

    /**
     * Initializes the Hop aggregator client based on the mode (test or live).
     * Note: Hop's hosted quote/build API only supports mainnet — there is no
     * separate testnet endpoint like Cetus's Env.Testnet. Calls made while in
     * "test" mode will still resolve against Hop's mainnet routes.
     * @param mode The mode for which to initialize the client.
     */
    initializeClient(mode: Mode) {
        if(mode !== "live")
        this.hopApi = new HopApi({
            fee_bps: 0,
        });
    }

    /**
     * Gets the exchange rate from Hop aggregator
     * @param token Input token address
     * @param amount Amount of input token (decimal)
     * @returns The exchange rate (how much of token for 1 USDC)
     */
    async getTokenPrice(amount: number, token: Token, mode: Mode): Promise<bigint | null> {
        this.initializeClient(mode);
        const coinType = getCoinType(token, mode === "live" ? "mainnet" : "testnet");
        const usdcType = getCoinType("USDC", mode === "live" ? "mainnet" : "testnet");
        if (!coinType || !usdcType) {
            logger.error(`Coin type not found for token: ${token} and mode: ${mode}`);
            throw new APIError("Coin type not found", STATUS.notFound);
        }

        const target = BigInt(Math.floor(Number(amount) * getCoinDecimal(Token.USDC)));

        const route = await this.getQuote(usdcType, coinType, target.toString());

        if (!route) {
            logger.error(`No quote found for fromCoinType: ${token} and toCoinType: ${usdcType}`);
            return null;
        }
        return BigInt(Math.floor(Number(route.amount_out)));
    }

    /**
     * Gets a quote from Hop aggregator
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input token in its raw units (as string)
     * @returns The quote response, or null if no route was found
     */
    private async getQuote(tokenIn: string, tokenOut: string, amountIn: string): Promise<QuoteResponse | null> {
        logger.debug(
            `Fetching Hop quote: ${amountIn} ${tokenIn} -> ${tokenOut}`,
        );
        try {
            const quote = await this.hopApi.quote({
                coin_in: tokenIn,
                coin_out: tokenOut,
                amount_in: amountIn,
            });

            if (!quote || !quote.routes || quote.routes.length === 0) {
                return null;
            }

            return quote;
        } catch (error: any) {
            logger.error(`Hop getQuote failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Executes a swap on Hop aggregator
     * @param coinTypeIn Input token address
     * @param coinTypeOut Output token address
     * @param amount Input amount (decimal)
     * @param coinIn The input coin object with balance and type
     * @param sender The sender address for the transaction
     * @param tx The transaction object to be used for the swap
     * @returns The output coin object and the best quote used for the swap
     */
    async swapTokens(
        amount: bigint,
        coinTypeIn: string,
        coinTypeOut: string,
        coinIn: TransactionObjectArgument,
        sender: string,
        tx: Transaction
    ): Promise<{
        coinOut: TransactionObjectArgument;
        bestQuote: QuoteResponse;
    } | null> {
        this.initializeClient("live");
        try {
            const bestQuote = await this.getQuote(coinTypeIn, coinTypeOut, amount.toString());

            if (!bestQuote) {
                logger.error(`No quote found for fromCoinType: ${coinTypeIn} and toCoinType: ${coinTypeOut}`);
                return null;
            }

            // Hop computes a 1% slippage min_out itself if not supplied; we set
            // it explicitly to mirror Cetus's 1% slippage tolerance.
            const minOut = BigInt(Math.floor(bestQuote.amount_out * 0.99));

            const { output_coin } = await this.hopApi.buildTransaction(bestQuote, {
                sender,
                mode: "return_output_coin",
                min_out: minOut.toString(),
                input_coin: coinIn,
                tx,
            });

            return { coinOut: output_coin, bestQuote };
        } catch (error: any) {
            logger.error(`Hop swapTokens failed: ${error.message}`);
            return null;
        }
    }

}