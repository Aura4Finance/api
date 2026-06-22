import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { SUPPORTED_NETWORKS } from "@/constants/networks.constant";
import { APIError } from "@/utils/error-handler";
import { TransactionRepository } from "@/repositories/transaction.repository";
import { GetAllTransactionsDto } from "@/dto/transaction.dto";
import { Mode, Token, Transaction } from "@/generated/prisma/client";

@Service()
export class TransactionService {

    constructor(
        private readonly transactionRepository: TransactionRepository,
    ) { }

    private getNetworkLogoUrl(network?: string): string | null {
        if (!network) return null;
        const networkData = SUPPORTED_NETWORKS.find(n => n.code === network || n.symbol === network);
        return networkData?.logoUrl || null;
    }

    private getTokenLogoUrl(network: string, token: Token): string | null {
        const networkData = SUPPORTED_NETWORKS.find(n => n.code === network || n.symbol === network);
        const tokenData = networkData?.supportedTokens?.find(( t: { symbol: string; } ) => t.symbol === String(token));
        return tokenData?.logoUrl || null;
    }

    private enrichTransactionWithNetworkLogo(transaction: any) {
        return {
            ...transaction,
            network: {
                symbol: transaction.network,
                logo: this.getNetworkLogoUrl(transaction.network)
            },
            token: {
                symbol: transaction.token,
                logo: this.getTokenLogoUrl(transaction.network, transaction.token)
            }
        };
    }

    async getTransactionById(
        txId: string,
        mode: Mode,
        profileId?: string
    ) {
        let transaction = await this.transactionRepository.getTransactionById(txId, mode, profileId);
        if (!transaction) {
            throw new APIError("Transaction not found", STATUS.notFound);
        }
        return {
            message: "Transaction retrieved successfully",
            payload: this.enrichTransactionWithNetworkLogo(transaction)
        };
    }

    async getAllTransactions(
        query: GetAllTransactionsDto,
        mode: Mode,
        profileId?: string
    ) {
        let transactions = await this.transactionRepository.getAllTransactions(query, mode, profileId);

        if (!transactions) {
            throw new APIError("No transactions found for this account.", STATUS.notFound);
        }
        return {
            message: "Transactions retrieved successfully",
            payload: {
                ...transactions,
                transactions: transactions.transactions.map((transaction: Transaction) => this.enrichTransactionWithNetworkLogo(transaction))
            }
        };
    }

}