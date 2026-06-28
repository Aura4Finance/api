import { Service } from "typedi";
import { WalletService } from "@/services/wallet.service";
import { SettlementRepository } from "@/repositories/user/settlement.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { PayoutRepository } from "@/repositories/payout.repository";
import { TransactionStatus, TransactionType, Network, Mode, Wallet } from "@/generated/prisma/client";
import { CryptoPayOutDto } from "@/dto/payout.dto";
import { InitiatePayoutDto } from "@/dto/fiat.dto";
import { FiatService } from "@/services/user/fiat.service";
import { FiatRepository } from "@/repositories/user/fiat.repository";
import logger from "@/utils/logger";
import { logTransactionError } from "@/utils/log-transaction-error";
import { SuiClientTypes } from "@mysten/sui/client";
import { TatumRpcClient } from "@/services/tatum.service";
import { getCoinDecimal, getCoinType } from "@/constants/tokens.constants";
import { bigIntToDecimal } from "@/utils/decimal-to-big-int";

@Service()
export class PayoutService {

    constructor(
        private readonly walletService: WalletService,
        private readonly payoutRepository: PayoutRepository,
        private readonly fiatRepository: FiatRepository,
        private readonly fiatService: FiatService,
        private readonly settlementRepository: SettlementRepository,
        private readonly tatumRpcClient: TatumRpcClient
    ) { }

    private async fetchCoins(walletAddress: string, mode: Mode) {
        let nextCursor: string | null = null;
        const coinObjects: string[] = [];
        let hasNext = true;

        try {
            while (hasNext) {
                const coins = await this.tatumRpcClient.listCoins({
                    address: walletAddress,
                    coinType: <string>getCoinType("USDC", mode === "test" ? "testnet" : "mainnet"),
                    ...(nextCursor && { cursor: nextCursor }),
                    mode
                });
                coinObjects.push(...coins.data.map((c) => c.coinObjectId));
                hasNext = coins.hasNextPage;
                nextCursor = coins.nextCursor ?? null;
            }
            return coinObjects;
        } catch (error: any) {
            throw new APIError("Unable to fetch on-chain balances. Please try again.", STATUS.serverUnavailable);
        }
    }

    /**
     * Gets total balance for a user.
     */
    async getBalances(address: string, mode: Mode) {

        const balance = await this.tatumRpcClient.getBalance({
            address,
            coinType: <string>getCoinType("USDC", mode === "test" ? "testnet" : "mainnet"),
            mode
        })

        return {
            message: "Balances retrieved successfully",
            payload: [
                {
                    coinType: "USDC",
                    balance: bigIntToDecimal(BigInt(balance.totalBalance), getCoinDecimal("USDC"), 4),
                }
            ]
        };
    }

    async getPrimaryCoin(
        keys: Wallet,
        mode: Mode
    ) {

        const coins = await this.fetchCoins(keys.address, mode);
        if (coins?.length == 0 || !coins?.[0]) {
            throw new APIError("No balance available for payout.", STATUS.bad);
        }
        const primaryCoin = coins?.[0];
        const mergeTargets = coins?.slice(1);

        if (mergeTargets.length != 0) {
            const derivedWalletBuffer = await deriveWallet(keys.derivationIndex);
            const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
            const result = await this.walletService.mergeCoinObjects(
                secretKey,
                primaryCoin,
                mergeTargets,
                mode
            )

            if (result.$kind !== "Transaction") {
                logTransactionError(result);
                throw new APIError("Payout failed because the on-chain service is unavailable.", STATUS.serverUnavailable)
            }
        }
        return primaryCoin;
    }

    private async finalizeCryptoPayout(
        wallet: Wallet,
        amount: number,
        to: string,
        payoutId: string,
        mode: Mode
    ) {
        const derivedWalletBuffer = await deriveWallet(<number>wallet?.derivationIndex);
        const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
        const result = await this.walletService.withdrawlToMerchant(
            secretKey,
            amount,
            to,
            mode
        );

        if (result.$kind !== "Transaction") {
            const errorMessage = result.FailedTransaction.effects?.status?.error?.message;
            if (errorMessage?.includes("InsufficientCoinBalance")) {
                throw new APIError(
                    "Refund failed due to insufficient balance.",
                    STATUS.conflict
                );
            }
            logTransactionError(result)
            await this.payoutRepository.failPayout(
                payoutId,
                result.FailedTransaction?.digest
            );
            throw new APIError("Unable to process payout transaction.", STATUS.serverUnavailable);
        }
        await this.payoutRepository.confirmPayout(
            payoutId,
            result.Transaction.digest
        );
        const gasUsed = result.Transaction.effects?.gasUsed;
        const totalGas = Number(BigInt(Number(gasUsed?.computationCost)) + BigInt(Number(gasUsed?.storageCost)) - BigInt(Number(gasUsed?.storageRebate))) * 0.000000001;
        return {
            message: "Payout initiated successfully",
            payload: {
                status: "COMPLETED",
                amount,
                txDigest: result.Transaction.digest,
                executionTime: result.Transaction.epoch,
                gasFee: totalGas,
                platformFee: amount * 0.01,
                amountRecieved: amount * 0.99,
            },
        };
    }

    private async retryCryptoPayout(
        wallet: Wallet,
        transactionId: string,
        amount: number,
        to: string,
        mode: Mode,
    ) {

        return await this.finalizeCryptoPayout(
            wallet,
            amount,
            to,
            transactionId,
            mode
        );
    }

    async initiateCryptoPayout(
        body: CryptoPayOutDto,
        wallet: Wallet,
        profileId: string,
        mode: Mode
    ) {
        let to: string;
        let network: Network;
        let cryptoAccountId: string | undefined = undefined;

        if (body.cryptoSettlementAccountId) {
            const settlementAccount = await this.settlementRepository.findSettlementAccountById(body.cryptoSettlementAccountId, profileId);

            if (!settlementAccount) {
                throw new APIError("Settlement account not found.", STATUS.bad);
            }

            to = settlementAccount.walletAddress;
            network = settlementAccount.network;
            cryptoAccountId = settlementAccount.id;

        } else

            if (body.walletAddress && body.network) {
                to = body.walletAddress;
                network = body.network;
                if (body.save) {
                    if (!body.alias) throw new APIError("Alias is required to save this wallet address.", STATUS.bad);
                    cryptoAccountId = (await this.settlementRepository.addSettlementAccount(body.walletAddress, body.network, body.alias, profileId)).id;
                }
            } else {
                throw new APIError("Provide a settlement account or a wallet address and network.", STATUS.bad);
            }

        const amountInNGN = await this.walletService.convertBetweenCurrencyAndUSDT(body.amount, "USD", "from_USDT");
        const payout = await this.payoutRepository.createPayout(
            network,
            amountInNGN,
            body.amount,
            "CRYPTO",
            to,
            profileId,
            mode,
            cryptoAccountId
        );

        return this.finalizeCryptoPayout(
            wallet,
            body.amount,
            to,
            payout.id,
            mode
        );
    }

    private async finalizeFiatPayout(
        wallet: Wallet,
        amount: number,
        accountIdentifier: string,
        bankCode: string,
        accountName: string,
        payoutId: string,
        mode: Mode
    ) {
        const walletBuffer = await deriveWallet(wallet.derivationIndex);
        const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(walletBuffer);
        let tx: SuiClientTypes.TransactionResult<{
            effects: true;
            objectTypes: true;
        }>;
        try {
            tx = await this.walletService.offrampSmartContractCall(
                amount,
                secretKey,
                mode
            );
        } catch (err: any) {
            throw new APIError("Payout failed. Please try again.", STATUS.bad);
        }


        if (tx.$kind !== "Transaction") {
            await this.payoutRepository.failPayout(
                payoutId,
                tx.FailedTransaction.digest
            );
            throw new APIError(`Payout failed. On-chain transaction failed${tx.FailedTransaction.digest ? ` (${tx.FailedTransaction.digest})` : ""}.`, STATUS.bad);
        }

        let result: {
            id: string;
            status: string;
        };
        try {
            result = await this.fiatService.initiatePayout(
                tx.Transaction.digest,
                bankCode,
                accountIdentifier,
                accountName,
            );

            if (result.id !== "COMPLETED") {
                logger.info(`Payout initiation returned non-completed status: ${result.status} (Ramp order ID: ${result.id})`);
                throw new APIError("Payout failed after on-chain success. Off-chain payout did not complete.", STATUS.bad);
            }

        } catch (err: any) {
            await this.payoutRepository.failPayout(
                payoutId,
                tx.Transaction.digest
            );
            throw new APIError("Payout failed. Please try again.", STATUS.bad);
        }

        await this.payoutRepository.confirmPayout(
            payoutId,
            tx.Transaction.digest,
            result.id
        );

        const gasUsed = tx.Transaction.effects.gasUsed;
        const totalGas = Number(BigInt(Number(gasUsed?.computationCost)) + BigInt(Number(gasUsed?.storageCost)) - BigInt(Number(gasUsed?.storageRebate))) * 0.000000001;

        return {
            message: "Payout initiated successfully",
            payload: {
                status: "COMPLETED",
                amount,
                txDigest: tx.Transaction.digest,
                executionTime: tx.Transaction?.epoch,
                gasFee: totalGas,
                platformFee: amount * 0.005,
                amountRecieved: amount * 0.995,
            },
        };
    }

    private async retryFiatPayout(
        profileId: string,
        wallet: Wallet,
        transactionId: string,
        mode: Mode,
        amount: number,
        fiatAccountId?: string | null
    ) {
        let accountIdentifier: string;
        let bankCode: string;
        let accountName: string;

        // Try to get fiat account from payout transaction
        if (fiatAccountId) {
            const fiatAccount = await this.fiatRepository.findAccountById(profileId, fiatAccountId);
            if (fiatAccount) {
                accountIdentifier = fiatAccount.accountNumber;
                bankCode = fiatAccount.bankCode;
                accountName = fiatAccount.accountName;
            } else {
                throw new APIError("Fiat account for this payout was not found.", STATUS.notFound);
            }
        } else {
            // Fallback to user's primary fiat account
            const primaryFiatAccount = await this.fiatRepository.getPrimaryAccount(profileId);
            if (!primaryFiatAccount) {
                throw new APIError("No fiat account found for this payout. Please create new payout.", STATUS.notFound);
            }

            accountIdentifier = primaryFiatAccount.accountNumber;
            bankCode = primaryFiatAccount.bankCode;
            accountName = primaryFiatAccount.accountName;
        }

        return await this.finalizeFiatPayout(
            wallet,
            amount,
            accountIdentifier,
            bankCode,
            accountName,
            transactionId,
            mode
        );
    }

    //using Linq or our custom API service
    async initiateFiatPayout(
        profileId: string,
        wallet: Wallet,
        body: InitiatePayoutDto,
        mode: Mode,
    ) {
        let {
            amount,
            accountId,
            accountIdentifier,
            bankCode,
            save
        } = body;
        let accountName: string;
        let fiatAccountId: string | undefined = undefined;
        if (accountId) {
            const account = await this.fiatRepository.findAccountById(profileId, accountId);
            if (!account) {
                throw new APIError("Fiat account not found.", STATUS.notFound);
            }
            accountIdentifier = account.accountNumber;
            bankCode = account.bankCode;
            accountName = account.accountName;
            fiatAccountId = account.id;
        } else if (accountIdentifier && bankCode) {
            const resolvedAccount = await this.fiatService.resolveAccountName(accountIdentifier, bankCode);
            if (!resolvedAccount.payload.accountName) {
                throw new APIError("Unable to resolve the provided account details.", STATUS.bad);
            }
            accountName = resolvedAccount.payload.accountName;
            if (save) {
                fiatAccountId = (await this.fiatService.addBankAccount(accountIdentifier, bankCode, false, profileId)).id;
            } else {
                fiatAccountId = undefined;
            }
        } else {
            const primaryFiatAccount = await this.fiatRepository.getPrimaryAccount(profileId);
            if (!primaryFiatAccount) throw new APIError("Provide accountId or accountIdentifier and bankCode.", STATUS.bad);

            accountIdentifier = primaryFiatAccount.accountNumber;
            bankCode = primaryFiatAccount.bankCode;
            accountName = primaryFiatAccount.accountName;
            fiatAccountId = primaryFiatAccount.id;
        }

        const payout = await this.payoutRepository.createPayout(
            "SUI",
            amount,
            amount,
            "FIAT",
            wallet.address,
            profileId,
            mode,
            undefined,
            fiatAccountId
        );

        return this.finalizeFiatPayout(
            wallet,
            amount,
            <string>accountIdentifier,
            <string>bankCode,
            accountName,
            payout.id,
            mode
        );
    }

    async retryPayout(
        transactionId: string,
        profileId: string,
        wallet: Wallet,
        mode: Mode
    ) {

        const payoutTransaction = await this.payoutRepository.getPayoutById(transactionId, profileId);
        if (
            !payoutTransaction ||
            payoutTransaction.confirmedAt ||
            payoutTransaction.status !== TransactionStatus.FAILED ||
            payoutTransaction.type !== TransactionType.PAYOUT
        ) {
            throw new APIError("Payout transaction is not eligible for retry.", STATUS.bad);
        }

        if (payoutTransaction?.payout?.method === "CRYPTO") {
            return await this.retryCryptoPayout(
                wallet,
                transactionId,
                payoutTransaction.amountInUSDC,
                <string>payoutTransaction?.payout?.walletAddress,
                mode
            );
        } else {
            return await this.retryFiatPayout(
                profileId,
                wallet,
                transactionId,
                mode,
                payoutTransaction.amountInUSDC,
                payoutTransaction?.payout?.fiatAccountId
            )
        }

    }
}
