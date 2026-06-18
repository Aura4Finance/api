import { Service } from "typedi";
import { APIError } from "@/utils/error-handler";
import logger from "@/utils/logger";
import { STATUS } from "@/constants/status.constant";
import { getCoinType } from "@/constants/tokens.constants";
import { Mode, Token } from "../../generated/prisma";
import { getTokenPrice, MetaAg, MetaQuote } from "@7kprotocol/sdk-ts";
import { Transaction, TransactionObjectArgument, coinWithBalance } from "@mysten/sui/transactions";

@Service()
export class SevenKAggService {
    private metaAg: MetaAg;

    constructor() {
        this.metaAg = new MetaAg();
    }
    async getTokenPrice(amount: number, token: Token, mode: Mode): Promise<number> {
        const coinType = getCoinType(token, mode === "live" ? "mainnet" : "testnet");
        if (!coinType) {
            logger.error(`Coin type not found for token: ${token} and mode: ${mode}`);
            throw new APIError("Coin type not found", STATUS.notFound);
        }
        const rate = await getTokenPrice(coinType);
        if (!rate) {
            logger.error(`Token price not found for coin type: ${coinType}`);
            throw new APIError("Token price not found", STATUS.notFound);
        }
        return amount / rate;
    }

    async swapTokens(
        amount: bigint, 
        coinTypeIn: string, 
        coinTypeOut: string,
        signer: string,
        tx: Transaction
    ): Promise<{
        coinOut: TransactionObjectArgument;
        bestQuote: MetaQuote;
    }
        > {
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
                throw new APIError("No quote found", STATUS.notFound);
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
            throw new APIError("Failed to swap tokens using 7kAgg", STATUS.serverError);
        }
    }
}