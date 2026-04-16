import { Service } from "typedi";
import { getFullnodeUrl, SuiClient, type SuiTransactionBlockResponse } from "@mysten/sui/client";
import { UserRepository } from "@/repositories/user/user.repository";
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

@Service()
export class PayoutService {
    private client!: SuiClient;
    private primaryCoin: any;
    cointype!: string;

    // cache for coin data: walletAddress -> { coinObjects, totalBalance }
    private walletCache: Map<string, { coinObjects: string[]; totalBalance: number }> = new Map();

    constructor(
        private readonly userRepository: UserRepository,
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
            throw new APIError("Unable to fetch balances from on-chain network", STATUS.serverUnavailable);
        }
    }

    /**
     * Gets total balance for a user.
     */
    async getBalances(userId: string, mode: Mode) {
        const profile = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile);

        if (!profile) {
            throw new Error("Merchant or business profile not found");
        }

        const walletAddress = profile.wallet[0]?.address;
        if (!walletAddress) {
            throw new Error("Wallet address not found");
        }
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
            throw new APIError("No balance to withdrawl", STATUS.bad);
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
                throw new APIError("Unable to process payout: On-chain service unavailable", STATUS.serverUnavailable)
            }
        }
        return primaryCoin;
    }

    private async finalizeCryptoPayout(
        userId: string,
        amount: number,
        to: string,
        payoutId: string,
        mode: Mode
    ) {
        const user = await this.userRepository.findUserById(userId);
        const wallet = user?.businessProfile?.wallet[0];
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
                `Unable to process payout: ${errorCode !== "0"
                    ? "Insufficient Balance"
                    : errorCode != null
                        ? "Unknown error occurred"
                        : "Transaction failed"
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

    async retryCryptoPayout(
        transactionId: string,
        userId: string,
        mode: Mode
    ) {
        await this.setActiveNetwork(mode);
        const payoutTransaction = await this.payoutRepository.getPayoutById(transactionId, userId);
        if (
            !payoutTransaction ||
            payoutTransaction.confirmedAt ||
            payoutTransaction.status !== TransactionStatus.FAILED ||
            payoutTransaction?.payout?.method!== "CRYPTO" ||
            payoutTransaction.type !== TransactionType.PAYOUT
        ) {
            throw new APIError("Invalid payout transaction ID", STATUS.bad);
        }
        const keys = await this.userRepository.findUserById(userId);
        this.primaryCoin = await this.getPrimaryCoin(<Wallet>keys?.businessProfile?.wallet[0], mode);

        return await this.finalizeCryptoPayout(
            userId,
            payoutTransaction.amount,
            <string>payoutTransaction.payout?.walletAddress,
            payoutTransaction.id,
            mode
        );
    }

    /**
     * Merges all user-owned coins into one (preparing for payout).
     */
    async initiateCryptoPayout(
        body: CryptoPayOutDto,
        userId: string,
        mode: Mode
    ) {
        await this.setActiveNetwork(mode);
        const keys = await this.userRepository.findUserById(userId);
        const profile = keys?.businessProfile;
        if (!profile) {
            throw new Error("Merchant or business profile not found");
        }
        let to: string;
        let network: Network;
        let cryptoAccountId: string | undefined = undefined;
        if (body.cryptoSettlementAccountId) {
            const settlementAccount = await this.settlementRepository.findSettlemtAccountById(body.cryptoSettlementAccountId, profile.id);
            if (!settlementAccount) {
                throw new APIError("Invalid settlement account ID", STATUS.bad);
            }
            to = settlementAccount.walletAddress;
            network = settlementAccount.network;
            cryptoAccountId = settlementAccount.id;
        } else
            if (body.walletAddress && body.network) {
                to = body.walletAddress;
                network = body.network;
                if (body.save) {
                    if (!body.alias) throw new APIError("Alias to save wallet address not found!", STATUS.bad);
                    cryptoAccountId = (await this.settlementRepository.addSettlementAccount(body.walletAddress, body.network, body.alias, profile.id)).id;
                }
            } else {
                throw new APIError("Settlemtment account or wallet address and network is required", STATUS.bad);
            }
        this.primaryCoin = await this.getPrimaryCoin(<Wallet>keys?.businessProfile?.wallet[0], mode);
        const amountInNGN = await this.walletService.convertBetweenCurrencyAndUSDT(body.amount, "USD", "from_USDT");
        const payout = await this.payoutRepository.createPayout(
            network,
            amountInNGN,
            body.amount,
            "CRYPTO",
            to,
            <string>keys?.businessProfile?.id,
            mode,
            cryptoAccountId
        );
        return this.finalizeCryptoPayout(userId, body.amount, to, payout.id, mode);
    }

    private async finalizeFiatPayout(
        userId: string,
        amount: number,
        accountIdentifier: string,
        bankCode: string,
        accountName: string,
        payoutId: string,
        mode: Mode
    ) {
        const user = await this.userRepository.findUserById(userId);
        const walletIndex = user?.businessProfile?.wallet[0]?.derivationIndex;
        const wallet = await deriveWallet(<number>walletIndex);
        const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(wallet);
        let tx: SuiTransactionBlockResponse;
        try {
            const primaryCoinObjectId = await this.getPrimaryCoin(<Wallet>user?.businessProfile?.wallet[0], mode);
            
            tx = await this.walletService.offrampSmartContractCall(
                BigInt((amount.toFixed(6).replace(".", ""))),
                primaryCoinObjectId,
                secretKey,
                mode
            );
        
        } catch (err: any) {
            throw new APIError(`Payout failed: ${err.message}`, STATUS.bad);
        }

        if (!tx.effects || tx.effects.status.status !== "success") {
            await this.payoutRepository.failPayout(
                payoutId,
                tx.digest
            );
            throw new APIError(`Payout failed: On-chain transaction failed${tx.digest ? `( ${tx.digest})` : ''}`, STATUS.bad);
        }

        let result: {
            rampOrderId: string;
            status: string;
        };
        try {
            result = await this.fiatService.initiatePayout(
                tx.digest,
                bankCode,
                accountIdentifier,
                accountName,
            );
        } catch (err: any) {
            await this.payoutRepository.failPayout(
                payoutId,
                tx.digest
            );
            throw new APIError(`Payout failed: ${err.message}`, STATUS.bad);
        }

        await this.payoutRepository.confirmPayout(
            payoutId,
            tx.digest,
            result.rampOrderId
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

    async retryFiatPayout(
        transactionId: string,
        userId: string,
        mode: Mode
    ) {
        const user = await this.userRepository.findUserById(userId);
        await this.setActiveNetwork(mode);
        const payoutTransaction = await this.payoutRepository.getPayoutById(transactionId, <string>user?.businessProfile?.id);
        if (
            !payoutTransaction ||
            payoutTransaction.confirmedAt ||
            payoutTransaction.status !== TransactionStatus.FAILED ||
            payoutTransaction?.payout?.method!== "FIAT" ||
            payoutTransaction.type !== TransactionType.PAYOUT
        ) {
            throw new APIError("Invalid payout transaction ID", STATUS.bad);
        }

        let accountIdentifier: string;
        let bankCode: string;
        let accountName: string;

        // Try to get fiat account from payout transaction
        const fiatAccountId = payoutTransaction.payout.fiatAccountId;
        if (fiatAccountId) {
            const fiatAccount = await this.fiatRepository.findAccountById(<string>user?.businessProfile?.id, fiatAccountId);
            if (fiatAccount) {
                accountIdentifier = fiatAccount.accountNumber;
                bankCode = fiatAccount.bankCode;
                accountName = fiatAccount.accountName;
            } else {
                throw new APIError("Fiat account associated with this payout not found!", STATUS.notFound);
            }
        } else {
            // Fallback to user's primary fiat account
            const primaryFiatAccount = await this.fiatRepository.getPrimaryAccount(<string>user?.businessProfile?.id);
            if (!primaryFiatAccount) {
                throw new APIError("No fiat account found for this payout. Please provide account details.", STATUS.notFound);
            }

            accountIdentifier = primaryFiatAccount.accountNumber;
            bankCode = primaryFiatAccount.bankCode;
            accountName = primaryFiatAccount.accountName;
        }

        return await this.finalizeFiatPayout(
            userId,
            payoutTransaction.amount,
            accountIdentifier,
            bankCode,
            accountName,
            payoutTransaction.id,
            mode
        );
    }

    //using Linq or our custom API service
    async initiateFiatPayout(
        userId: string,
        mode: Mode,
        body: InitiatePayoutDto
    ) {
        await this.setActiveNetwork(mode);
        const user = await this.userRepository.findUserById(userId);
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
            const account = await this.fiatRepository.findAccountById(<string>user?.businessProfile?.id, accountId);
            if (!account) {
                throw new APIError("Account not found", STATUS.notFound);
            }
            accountIdentifier = account.accountNumber;
            bankCode = account.bankCode;
            accountName = account.accountName;
            fiatAccountId = account.id;
        } else if (accountIdentifier && bankCode) {
            const resolvedAccount = await this.fiatService.resolveAccountName(accountIdentifier, bankCode);
            if (!resolvedAccount.payload.accountName) {
                throw new APIError("Provided account cannot be resolved!", STATUS.bad);
            }
            accountName = resolvedAccount.payload.accountName;
            if (save) {
               fiatAccountId = (await this.fiatService.addBankAccount(accountIdentifier, bankCode, false, userId)).id;
            } else {
               fiatAccountId = undefined;
            }  
        } else {
            const primaryFiatAccount = await this.fiatRepository.getPrimaryAccount(<string>user?.businessProfile?.id);
            if (!primaryFiatAccount) throw new APIError("Either accountId or both accountIdentifier and bankCode must be provided", STATUS.bad);
        
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
            <string>user?.businessProfile?.wallet[0]?.address,
            <string>user?.businessProfile?.id,
            mode,
            undefined,
            fiatAccountId      
        );

        return this.finalizeFiatPayout(
            userId,
            amount,
            accountIdentifier,
            bankCode,
            accountName,
            payout.id,
            mode
        );
    }
}
