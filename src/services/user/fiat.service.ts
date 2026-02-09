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

    async getRates() {
        let response: any;
        try{
            response = await payfricaClient.get("/rates", {
                params: {
                    currency: "NGN"
                }
            });
        }catch(err: any){
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
        try{
             response = await payfricaClient.get('/banks', {
                params: {
                    currency: "NGN",
                }
            });
        }catch(err: any){
            throw new APIError(`Error fetching banks: ${err.message}`, STATUS.bad);
        }

        return {
            message: "Banks retrieved successfully",
            payload: response.data.data
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
        if (!resolvedAccount) {
            throw new APIError("Unable to resolve account name", STATUS.bad);
        }

        const profile = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile);

        if (!profile?.businessName) {
            throw new APIError("Business profile incomplete", STATUS.bad);
        }
        const existingAccount = await this.fiatRepository.getAccountByBankCodeAndNumber(accountNumber, bankCode);
        
        if(existingAccount){
            throw new APIError("Bank account already exists", STATUS.conflict);
        }

        const [existingAccounts, primaryAccount] = await Promise.all([
            this.fiatRepository.getAccounts(profile.id),
            this.fiatRepository.getPrimaryAccount(profile.id)
        ]);

        // If no existing accounts, force this as primary
        if (!existingAccounts || existingAccounts.length === 0) {
            isPrimary = true;
        }

        if (primaryAccount && isPrimary) {
            await this.fiatRepository.updateAccount(primaryAccount.id, profile.id as string, false);
        }

        //Create the new account
        const createdAccount = await this.fiatRepository.createAccount(
            bankName,
            accountNumber,
            bankCode,
            isPrimary,
            profile.id
        );

        return createdAccount;
    }


    async resolveAccountName(
        accountNumber: string,
        bankCode: string
    ) {
        let  response: any;
        
        try{
            response = await payfricaClient.get("/verify-account", {
               params: {
                   accountNumber,
                   bankCode
               },
           });
        }catch(err: any){
            throw new APIError(err.response?.data?.message || "Unable to resolve merchant fiat account", STATUS.conflict);
        }
        return response.data.data;
    }

    async getAllAccounts(
        userId: string
    ) {
        const profileId = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile?.id);

        const accounts = await this.fiatRepository.getAccounts(profileId as string);
        return accounts;
    }

    async deleteAccount(
        id: string,
        userId: string
    ) {
        const profileId = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile?.id);

        const account = await this.fiatRepository.findAccountById(id);
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

        const account = await this.fiatRepository.findAccountById(id);
        if (!account) {
            throw new APIError("Fiat account not found!", STATUS.notFound);
        }
        if (account.isPrimary == isPrimary) {
            throw new APIError(`Account is already set to primary, ${isPrimary}`, STATUS.conflict);
        }
        await this.fiatRepository.updateAccount(id, profileId as string, isPrimary);
    }
}