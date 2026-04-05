import { Service } from "typedi";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { UserRepository } from "@/repositories/user/user.repository";
import { WalletService } from "./wallet.service";
import { SettlementRepository } from "@/repositories/user/settlement.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { PayoutRepository } from "@/repositories/payout.repository";
import { TransactionStatus, TransactionType } from "../../generated/prisma";
import { CryptoPayOutDto } from "@/dto/payout.dto";

@Service()
export class PayoutService {
    private client: any;
    private primaryCoin: any;
    cointype =
        "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

    // cache for coin data: walletAddress -> { coinObjects, totalBalance }
    private walletCache: Map<string, { coinObjects: string[]; totalBalance: number }> = new Map();

    constructor(
        private readonly userRepository: UserRepository,
        private readonly walletService: WalletService,
        private readonly payoutRepository: PayoutRepository,
        private readonly settlementRepository: SettlementRepository
    ) { }

    private async setActiveNetwork(userId: string) {
        const user = await this.userRepository.findUserById(userId);
        this.client = new SuiClient({ url: getFullnodeUrl(`${user?.businessProfile?.isLive ? "mainnet" : "testnet"}`) });
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
    async getBalances(userId: string) {
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
        await this.setActiveNetwork(userId);
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
        keys: any,
        client: any = this.client
    ) {
        this.client = client;
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
                this.client
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
        payoutId: string
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
            this.client
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
        userId: string
    ) {
        await this.setActiveNetwork(userId);
        const payoutTransaction = await this.payoutRepository.getPayoutById(transactionId, userId);
        if (
            !payoutTransaction ||
            payoutTransaction.confirmedAt ||
            payoutTransaction.status !== TransactionStatus.FAILED ||
            payoutTransaction.type !== TransactionType.PAYOUT
        ) {
            throw new APIError("Invalid payout transaction ID", STATUS.bad);
        }
        const keys = await this.userRepository.findUserById(userId);
        this.primaryCoin = await this.getPrimaryCoin(keys?.businessProfile?.wallet[0]);

        return await this.finalizeCryptoPayout(
            userId,
            payoutTransaction.amount,
            <string>payoutTransaction.payout?.walletAddress,
            payoutTransaction.id
        );
    }

    /**
     * Merges all user-owned coins into one (preparing for payout).
     */
    async initiateCryptoPayout(
        body: CryptoPayOutDto,
        userId: string
    ) {
        await this.setActiveNetwork(userId);
        const keys = await this.userRepository.findUserById(userId);
        const profile = keys?.businessProfile;
        if (!profile) {
            throw new Error("Merchant or business profile not found");
        }
        let to: string;
        let network: string;
        if (body.cryptoSettlementAccountId) {
            const settlementAccount = await this.settlementRepository.findSettlemtAccountById(body.cryptoSettlementAccountId, profile.id);
            if (!settlementAccount) {
                throw new APIError("Invalid settlement account ID", STATUS.bad);
            }
            to = settlementAccount.walletAddress;
            network = settlementAccount.network;
        } else
            if (body.walletAddress) {
                to = body.walletAddress;
                if(!body.network){
                    throw new APIError("network is required for crypto payout", STATUS.bad);
                }
                network = body.network;
                if (body.save) {
                    if (!body.alias) throw new APIError("Alias to save wallet address not found!", STATUS.bad);
                    await this.settlementRepository.addSettlementAccount(body.walletAddress, body.network, body.alias, profile.id);
                }
            } else {
                throw new APIError("Settlemtment account or wallet address is required", STATUS.bad);
            }
        this.primaryCoin = await this.getPrimaryCoin(keys?.businessProfile?.wallet[0]);
        const amountInNGN = await this.walletService.convertBetweenCurrencyAndUSDT(body.amount, "USD", "from_USDT");
        const payout = await this.payoutRepository.createCryptoPayout(
            network,
            amountInNGN,
            body.amount,
            "CRYPTO",
            <string>keys?.businessProfile?.wallet[0]?.address,
            <string>keys?.businessProfile?.id,
            keys?.businessProfile?.isLive ? "live" : "test"
        );
        return this.finalizeCryptoPayout(userId, body.amount, to, payout.id);
    }

    //using Linq or our custom API service
    async initiateFiatPayout() { }
}
