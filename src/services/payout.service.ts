import { Service } from "typedi";
import { getFullnodeUrl, SuiClient, type SuiTransactionBlockResponse } from "@mysten/sui/client";
import { WalletService } from "./wallet.service";
import { SettlementRepository } from "@/repositories/user/settlement.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { PayoutRepository } from "@/repositories/payout.repository";
import { TransactionStatus, TransactionType, Network, Mode, Wallet } from "../../generated/prisma";
import { CryptoPayOutDto } from "@/dto/payout.dto";
import { InitiatePayoutDto } from "@/dto/fiat.dto";
import { FiatService } from "./user/fiat.service";
import { FiatRepository } from "@/repositories/user/fiat.repository";
import logger from "@/utils/logger";

@Service()
export class PayoutService {
    private client!: SuiClient;
    private primaryCoin: any;
    cointype!: string;

    // cache for coin data: walletAddress -> { coinObjects, totalBalance }
    private walletCache: Map<string, { coinObjects: string[]; totalBalance: number }> = new Map();

    constructor(
        private readonly walletService: WalletService,
        private readonly payoutRepository: PayoutRepository,
        private readonly fiatRepository: FiatRepository,
        private readonly fiatService: FiatService,
        private readonly settlementRepository: SettlementRepository
    ) { }

    private async setActiveNetwork(mode: Mode) {
        this.client = new SuiClient({ url: getFullnodeUrl(`${mode == "live" ? "mainnet" : "testnet"}`) });
        this.cointype = mode == "test" ? 
            "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC" :
            "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
    }

    private async fetchCoins(walletAddress: string) {
        let nextCursor: string | null = null;
        let totalBalance = 0;
        const coinObjects: string[] = [];
        let hasNext = true;

        try {
            while (hasNext) {
                const coinBalance: any = await this.client.getCoins({
                    owner: walletAddress,
                    coinType: this.cointype,
                    cursor: nextCursor,
                });

                const total = coinBalance.data
                    .map((coin: { balance: string }) => Number(coin.balance))
                    .reduce((a: number, b: number) => a + b, 0);

                totalBalance += total;
                coinObjects.push(...coinBalance.data.map((c: any) => c.coinObjectId));

                hasNext = coinBalance.hasNextPage;
                nextCursor = coinBalance.nextCursor ?? null;
            }

            // Cache the result for reuse
            this.walletCache.set(walletAddress, { coinObjects, totalBalance });
            return { coinObjects, totalBalance };
        } catch (error: any) {
            console.error("fetchCoins error:", error);
            throw new APIError("Unable to fetch on-chain balances. Please try again.", STATUS.serverUnavailable);
        }
    }

    /**
     * Gets total balance for a user.
     */
    async getBalances(walletAddress: string, mode: Mode) {
        await this.setActiveNetwork(mode);
        const cache: any = await this.fetchCoins(walletAddress);

        return {
            message: "Balances retrieved successfully",
            payload: [
                {
                    coinType: "USDC",
                    balance: cache?.totalBalance,
                }
            ]
        };
    }

    async getPrimaryCoin(
        keys: Wallet,
        mode: Mode
    ) {
        await this.setActiveNetwork(mode);
        const cache: any = await this.fetchCoins(keys.address);
        if (cache?.coinObjects.length == 0) {
            throw new APIError("No balance available for payout.", STATUS.bad);
        }
        const primaryCoin = cache?.coinObjects[0];
        const mergeTargets = cache?.coinObjects.slice(1);

        if (mergeTargets.length != 0) {
            const derivedWalletBuffer = await deriveWallet(keys.derivationIndex);
            const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
            const result = await this.walletService.mergeCoinObjects(
                secretKey,
                primaryCoin,
                mergeTargets,
                mode
            )
            const isSuccess = result?.effects?.status?.status === "success"
            if (!isSuccess) {
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
            this.primaryCoin,
            amount,
            to,
            mode
        );
        const isSuccess = result?.effects?.status?.status === "success"
        if (!isSuccess) {
            await this.payoutRepository.failPayout(
                payoutId,
                result.digest
            );
            const errorCode = result.effects?.abortError?.error_code;
            throw new APIError(
                `Payout failed: ${errorCode !== "0"
                    ? "insufficient balance"
                    : errorCode != null
                        ? "an unknown error occurred"
                        : "the transaction failed"
                }`,
                STATUS.serverUnavailable
            );
        }
        await this.payoutRepository.confirmPayout(
            payoutId,
            result.digest
        );
        const gasUsed = result.effects?.gasUsed;
        const totalGas = Number(BigInt(Number(gasUsed?.computationCost)) + BigInt(Number(gasUsed?.storageCost)) - BigInt(Number(gasUsed?.storageRebate))) * 0.000000001;
        return {
            message: "Payout initiated successfully",
            payload: {
                status: "COMPLETED",
                amount,
                txDigest: result.digest,
                executionTime: result.effects?.executedEpoch,
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
        walletAddress: string,
        mode: Mode
    ) {
        this.primaryCoin = await this.getPrimaryCoin(wallet, mode);

        return await this.finalizeCryptoPayout(
            wallet,
            amount,
            walletAddress,
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
        await this.setActiveNetwork(mode);
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
        this.primaryCoin = await this.getPrimaryCoin(wallet, mode);
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
        return this.finalizeCryptoPayout(wallet, body.amount, to, payout.id, mode);
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
        let tx: SuiTransactionBlockResponse;
        try {
            const primaryCoinObjectId = await this.getPrimaryCoin(wallet, mode);
            
            tx = await this.walletService.offrampSmartContractCall(
                BigInt((amount.toFixed(6).replace(".", ""))),
                primaryCoinObjectId,
                secretKey,
                mode
            );
        
        } catch (err: any) {
            throw new APIError("Payout failed. Please try again.", STATUS.bad);
        }

        if (!tx.effects || tx.effects.status.status !== "success") {
            await this.payoutRepository.failPayout(
                payoutId,
                tx.digest
            );
            throw new APIError(`Payout failed. On-chain transaction failed${tx.digest ? ` (${tx.digest})` : ""}.`, STATUS.bad);
        }

        let result: {
            id: string;
            status: string;
        };
        try {
            result = await this.fiatService.initiatePayout(
                tx.digest,
                bankCode,
                accountIdentifier,
                accountName,
            );

            if(result.id !== "COMPLETED"){
                logger.info(`Payout initiation returned non-completed status: ${result.status} (Ramp order ID: ${result.id})`);
                throw new APIError("Payout failed after on-chain success. Off-chain payout did not complete.", STATUS.bad);
            }

        } catch (err: any) {
            await this.payoutRepository.failPayout(
                payoutId,
                tx.digest
            );
            throw new APIError("Payout failed. Please try again.", STATUS.bad);
        }

        await this.payoutRepository.confirmPayout(
            payoutId,
            tx.digest,
            result.id
        );

        const gasUsed = tx.effects?.gasUsed;
        const totalGas = Number(BigInt(Number(gasUsed?.computationCost)) + BigInt(Number(gasUsed?.storageCost)) - BigInt(Number(gasUsed?.storageRebate))) * 0.000000001;
        
        return {
            message: "Payout initiated successfully",
            payload: {
                status: "COMPLETED",
                amount,
                txDigest: tx.digest,
                executionTime: tx.effects?.executedEpoch,
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
                throw new APIError("No fiat account found for this payout. Please provide account details.", STATUS.notFound);
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
        await this.setActiveNetwork(mode);
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
            accountIdentifier,
            bankCode,
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
    ){
        await this.setActiveNetwork(mode);
        const payoutTransaction = await this.payoutRepository.getPayoutById(transactionId, profileId);
        if (
            !payoutTransaction ||
            payoutTransaction.confirmedAt ||
            payoutTransaction.status !== TransactionStatus.FAILED ||
            payoutTransaction.type !== TransactionType.PAYOUT
        ) {
            throw new APIError("Payout transaction is not eligible for retry.", STATUS.bad);
        }

        if(payoutTransaction?.payout?.method === "CRYPTO" ){
            return await this.retryCryptoPayout(
                wallet,
                transactionId,
                payoutTransaction.amountInUSDC,
                <string>payoutTransaction?.payout?.walletAddress,
                mode
            );
        }else {
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
