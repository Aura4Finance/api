import { Service } from "typedi";
import { FiatRepository } from "@/repositories/user/fiat.repository";
import { STATUS } from "@/constants/status.constant";
import payfricaClient from "@/config/payfricaClient-config";
import { APIError } from "@/utils/error-handler";
import { UserRepository } from "@/repositories/user/user.repository";

@Service()
export class FiatService {
    constructor(
        private readonly fiatRepository: FiatRepository,
        private readonly userRepository: UserRepository
    ) { }

    async getRates(currency: string) {
        let response: any;
        try {
            response = await payfricaClient.get("/rates", {
                params: {
                    currency,
                    type: "offramp",
                    crypto: "USDC"
                }
            });
        } catch (err: any) {
            throw new APIError(`Error fetching rates: ${err.message}`, STATUS.bad);
        }
        return {
            message: "Rates retrieved successfully",
            payload: {
                rate: response.data.rate,
                timestamp: response.data.timestamp,
                rateDescription: response.data.rateDescription
            }
        }
    }

    async getBanks() {
        let response: any;
        try {
            response = await payfricaClient.get('/banks', {
                params: {
                    currency: "NGN",
                }
            });
        } catch (err: any) {
            throw new APIError(`Error fetching banks: ${err.message}`, STATUS.bad);
        }

        return {
            message: "Banks retrieved successfully",
            payload: response.data.data as {
                name: string,
                bankCode: string
            }[]
        }
    }

    async addBankAccount(
        accountNumber: string,
        bankCode: string,
        bankName: string,
        isPrimary: boolean,
        userId: string
    ) {

        const resolvedAccount = await this.resolveAccountName(accountNumber, bankCode);
        if (!resolvedAccount.payload) {
            throw new APIError("Unable to resolve account name", STATUS.bad);
        }

        const profileId = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile?.id);

        const existingAccount = await this.fiatRepository.getAccountByBankCodeAndNumber(String(accountNumber), bankCode);

        if (existingAccount) {
            throw new APIError("Bank account already exists", STATUS.conflict);
        }

        const [existingAccounts, primaryAccount] = await Promise.all([
            this.fiatRepository.getAccounts(<string>profileId),
            this.fiatRepository.getPrimaryAccount(<string>profileId)
        ]);

        // If no existing accounts, force this as primary
        if (!existingAccounts || existingAccounts.length === 0) {
            isPrimary = true;
        }

        if (primaryAccount && isPrimary) {
            await this.fiatRepository.updateAccount(primaryAccount.id, profileId as string, false);
        }

        //Create the new account
        const createdAccount = await this.fiatRepository.createAccount(
            bankName,
            accountNumber,
            resolvedAccount.payload.accountName,
            bankCode,
            isPrimary,
            <string>profileId
        );

        return createdAccount;
    }


    async resolveAccountName(
        accountNumber: string,
        bankCode: string
    ) {
        let response: any;

        try {
            response = await payfricaClient.get("/verify-account", {
                params: {
                    accountNumber,
                    bankCode
                },
            });
        } catch (err: any) {
            throw new APIError(err.response?.data?.message || "Unable to resolve merchant fiat account", STATUS.conflict);
        }
        return {
            message: "Account resolved successfully",
            payload: response.data.data as {
                accountNumber: string;
                accountName: string;
            }
        }
    }

    async getAllAccounts(
        userId: string
    ) {
        const profileId = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile?.id);

        const accounts = await this.fiatRepository.getAccounts(String(profileId));
        return {
            message: "Fiat accounts retrieved successfully",
            payload: accounts
        }
    }

    async deleteAccount(
        id: string,
        userId: string
    ) {
        const profileId = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile?.id);

        const account = await this.fiatRepository.findAccountById(<string>profileId, id);
        if (!account) {
            throw new APIError("Fiat account not found!", STATUS.notFound);
        }
        if (account.isPrimary) {
            throw new APIError("Cannot delete primary account. Please set another account as primary before deleting this account.", STATUS.conflict);
        }
        await this.fiatRepository.deleteAccount(id, profileId as string);
    }

    async updateAccount(
        id: string,
        userId: string,
        isPrimary: boolean
    ) {
        const profileId = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile?.id);

        if (!profileId) {
            throw new APIError("Business profile not found", STATUS.notFound);
        }

        const account = await this.fiatRepository.findAccountById(<string>profileId, id);
        if (!account) {
            throw new APIError("Fiat account not found!", STATUS.notFound);
        }

        if (account.isPrimary === isPrimary) {
            throw new APIError(
                `Account is already set to isPrimary = ${isPrimary}`,
                STATUS.conflict
            );
        }

        const accounts = await this.fiatRepository.getAccounts(profileId);
        if (
            accounts.length === 1 &&
            account.isPrimary === true &&
            isPrimary === false
        ) {
            throw new APIError(
                "You cannot unset the primary account when only one account exists",
                STATUS.bad
            );
        }

        await this.fiatRepository.updateAccount(id, profileId, isPrimary);
    }

    async initiatePayout(
        txDigest: string,
        bankCode: string,
        accountIdentifier: string,
        accountName: string
    ) {
        try {
            const result = await payfricaClient.post("offramp/instant", {
                digest: txDigest,
                cryptoAsset: "USDC",
                recipient: {
                    institution: bankCode,
                    accountIdentifier,
                    accountName,
                    currency: "NGN",
                    memo: "Instant payout"
                }
            });
            return result.data.data as {
                rampOrderId: string;
                status: string;
            };
        }catch(err: any) {
            throw new APIError(`Payout initiation failed: ${err.response?.data?.message || err.message}`, STATUS.bad);
        }

    }
}