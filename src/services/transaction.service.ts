import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { SUPPORTED_NETWORKS } from "@/constants/networks.constant";
import { APIError } from "@/utils/error-handler";
import { TransactionRepository } from "@/repositories/transaction.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { GetAllTransactionsDto } from "@/dto/transaction.dto";
import { Mode } from "../../generated/prisma";

@Service()
export class TransactionService {

    constructor(
        private readonly transactionRepository: TransactionRepository,
        private readonly userRepository: UserRepository
    ) { }

    private getNetworkLogoUrl(network?: string): string | null {
        if (!network) return null;
        const networkData = SUPPORTED_NETWORKS.find(n => n.code === network || n.symbol === network);
        return networkData?.logoUrl || null;
    }

    private enrichTransactionWithNetworkLogo(transaction: any) {
        return {
            ...transaction,
            network: {
                symbol: transaction.network,
                logo: this.getNetworkLogoUrl(transaction.network)
            }
        };
    }

    async getTransactionById(
        txId: string,
        mode: Mode,
        userId?: string
    ) {
        let transaction;
        if (userId) {
            const profile = await this.userRepository.findUserById(userId);
            if (!profile) {
                throw new APIError("Invalid user ID", STATUS.bad);
            }
            transaction = await this.transactionRepository.getTransactionById(txId, mode, profile.businessProfile?.id);
        } else {
            transaction = await this.transactionRepository.getTransactionById(txId, mode);
        }
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
        userId?: string
    ) {
        let transactions;
        if (userId) {
            const profile = await this.userRepository.findUserById(userId);
            if (!profile) {
                throw new APIError("Invalid user ID", STATUS.bad);
            }
            transactions = await this.transactionRepository.getAllTransactions(query, mode, profile?.businessProfile?.id);
        } else {
            transactions = await this.transactionRepository.getAllTransactions(query, query.mode);
        }

        if (!transactions) {
            throw new APIError("No transactions found", STATUS.notFound);
        }
        return {
            message: "Transactions retrieved successfully",
            payload: {
                ...transactions,
                transactions: transactions.transactions.map((transaction) => this.enrichTransactionWithNetworkLogo(transaction))
            }
        };
    }

}