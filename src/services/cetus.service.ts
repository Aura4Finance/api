import { Service } from "typedi";
import logger from "@/utils/logger";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { AggregatorClient, Env, RouterDataV3 } from '@cetusprotocol/aggregator-sdk';
import { Mode, Token } from "../../generated/prisma";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { getCoinType, getCoinDecimal } from "@/constants/tokens.constants";


@Service()
export class CetusService {
    private aggregatorClient!: AggregatorClient;

    /**
     * Initializes the Cetus aggregator client based on the mode (test or live).
     * @param mode The mode for which to initialize the client.
     */
    initializeClient(mode: Mode) {
        this.aggregatorClient = new AggregatorClient({
            env: mode === "live" ? Env.Mainnet : Env.Testnet
        });
    }

    /**
  * Gets the exchange rate from Cetus aggregator
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

        if (!route || route.insufficientLiquidity) {
            logger.error(`No quote found for fromCoinType: ${token} and toCoinType: ${usdcType}`);
            return null;
        }
        return BigInt(Math.floor(Number(route.amountOut) * getCoinDecimal(token)));
    }


    /**
* Gets a quote from Cetus aggregator
* @param tokenIn Input token address
* @param tokenOut Output token address
* @param amountIn Amount of input token in its raw units (as string)
* @returns The route information
*/
    private async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {

        logger.debug(
            `Fetching Cetus quote: ${amountIn} ${tokenIn} -> ${tokenOut}`,
        );
        const route = await this.aggregatorClient.findRouters({
            from: tokenIn,
            target: tokenOut,
            amount: amountIn,
            byAmountIn: true,
        });

        return route;
    }

    /**
 * Executes a swap on Cetus aggregator
 * @param coinTypeIn Input token address
 * @param coinTypeOut Output token address
 * @param amount Input amount (decimal)
 * @param coinIn The input coin object with balance and type
 * @param tx The transaction object to be used for the swap
 * @returns The output coin object and the best quote used for the swap
 */
    async swapTokens(
        amount: bigint,
        coinTypeIn: string,
        coinTypeOut: string,
        coinIn: TransactionObjectArgument,
        tx: Transaction
    ): Promise<{
        coinOut: TransactionObjectArgument;
        bestQuote: RouterDataV3;
    } |null> {
        this.initializeClient("live");
        try {
            const bestQuote = await this.getQuote(coinTypeIn, coinTypeOut, amount.toString());

            if (!bestQuote || bestQuote.insufficientLiquidity) {
                logger.error(`No quote found for fromCoinType: ${coinTypeIn} and toCoinType: ${coinTypeOut}`);
                throw new APIError("No quote found", STATUS.notFound);
            }

            const coinOut = await this.aggregatorClient.routerSwap({
                router: bestQuote,
                txb: tx as any,
                inputCoin: coinIn as any,
                slippage: 0.01, // 1%,
            });

            return { coinOut: coinOut as any, bestQuote };
        } catch (error: any) {
            logger.error(`Cetus swapTokens failed: ${error.message}`);
            return null;
        }
    }
}