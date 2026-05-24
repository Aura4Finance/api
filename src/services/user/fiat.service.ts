import { Service } from "typedi";
import { FiatRepository } from "@/repositories/user/fiat.repository";
import { STATUS } from "@/constants/status.constant";
import payfricaClient from "@/config/payfricaClient-config";
import { APIError } from "@/utils/error-handler";

@Service()
export class FiatService {
    constructor(
        private readonly fiatRepository: FiatRepository,
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
            throw new APIError(
                "Unable to fetch rates. Please try again.",
                STATUS.bad
            );
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
            throw new APIError(
                "Unable to fetch banks. Please try again.",
                STATUS.bad
            );
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
        isPrimary: boolean,
        profileId: string
    ) {

        
        const existingAccount = await this.fiatRepository.getAccountByBankCodeAndNumber(<string>accountNumber, bankCode, <string>profileId);
        if (existingAccount) {
            throw new APIError("Bank account already exists.", STATUS.conflict);
        }
        const resolvedAccount = await this.resolveAccountName(accountNumber, bankCode);
        if (!resolvedAccount.payload) {
            throw new APIError("Unable to resolve account name. Please check the account details.", STATUS.bad);
        }
        const { payload: banks } = await this.getBanks();
        const resolvedBank = banks.find(bank => bank.bankCode == bankCode);

        const [existingAccounts, primaryAccount] = await Promise.all([
            this.fiatRepository.getAccounts(profileId),
            this.fiatRepository.getPrimaryAccount(profileId)
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
            <string>resolvedBank?.name,
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
            throw new APIError(
                "Unable to resolve account details. Please check the account number and bank code.",
                STATUS.conflict
            );
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
    ) {;
    
        const accounts = await this.fiatRepository.getAccounts(userId);
        return {
            message: "Fiat accounts retrieved successfully",
            payload: accounts
        }
    }

    async deleteAccount(
        id: string,
        userId: string
    ) {
        const account = await this.fiatRepository.findAccountById(userId, id);
        if (!account) {
            throw new APIError("Fiat account not found.", STATUS.notFound);
        }
        if (account.isPrimary) {
            throw new APIError("You cannot delete the primary account. Set another account as primary first.", STATUS.conflict);
        }
        await this.fiatRepository.deleteAccount(id, userId);
    }

    async updateAccount(
        id: string,
        userId: string,
        isPrimary: boolean
    ) {
        const account = await this.fiatRepository.findAccountById(userId, id);
        if (!account) {
            throw new APIError("Fiat account not found.", STATUS.notFound);
        }

        if (account.isPrimary === isPrimary) {
            throw new APIError(
                "Account already has the requested primary status.",
                STATUS.conflict
            );
        }

        const accounts = await this.fiatRepository.getAccounts(userId);
        if (
            accounts.length === 1 &&
            account.isPrimary === true &&
            isPrimary === false
        ) {
            throw new APIError(
                "You cannot unset the primary account while only one account exists.",
                STATUS.bad
            );
        }

        await this.fiatRepository.updateAccount(id, userId, isPrimary);
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
            return result.data as {
                id: string;
                status: string;
            };
        }catch(err: any) {
            throw new APIError(
                "Payout initiation failed. Please try again.",
                STATUS.bad
            );
        }

    }
}