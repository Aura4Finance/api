import { Service } from "typedi";
import { FiatRepository } from "@/repositories/user/fiat.repository";
import { STATUS } from "@/constants/status.constant"
import axios from "axios";
import { APIError } from "@/utils/error-handler";
import { UserRepository } from "@/repositories/user/user.repository";

@Service()
export class FiatService {
    constructor(
        private readonly fiatRepository: FiatRepository,
        private readonly userRepository: UserRepository
    ) { }

    async getBanks() {
        let nextCursor: string | null = null;
        let allBanks: any[] = [];
        let hasNext = true;

        while (hasNext) {
            const response: any = await axios.get(process.env.PAYSTACK_URL as string, {
                params: {
                    country: "nigeria", // ensure full list
                    currency: "NGN",
                    use_cursor: true,
                    perPage: 100,
                    next: nextCursor || undefined, // move to next page if available
                },
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_KEY}`,
                },
            });

            const { status, data, meta } = response.data;

            if (!status) {
                throw new APIError("Unable to fetch banks", STATUS.noContent);
            }

            allBanks.push(...data);

            // check if there’s another page
            if (meta && meta.next) {
                nextCursor = meta.next;
            } else {
                hasNext = false;
            }
        }

        return allBanks.map((bank: any) => ({
            name: bank.name,
            code: bank.code
        }))
    }

    async addBankAccount(
        accountNumber: string,
        bankCode: string,
        bankName: string,
        isPrimary: boolean,
        userId: string
    ) {

        const resolvedAccount = await this.resolveAccountName(accountNumber, bankCode);
        if (!resolvedAccount || !resolvedAccount.account_name) {
            throw new APIError("Unable to resolve account name", STATUS.bad);
        }

        const profile = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile);

        if (!profile?.businessName) {
            throw new APIError("Business profile incomplete", STATUS.bad);
        }

        const accountName = resolvedAccount.account_name.trim().toLowerCase();
        const matches = accountName.includes(profile.businessName);

        if (!matches) {
            throw new APIError(
                `Account name (${resolvedAccount.account_name}) does not match business name (${profile?.businessName})`,
                STATUS.conflict
            );
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
            await this.fiatRepository.updateAccount(primaryAccount.id, false);
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


    private async resolveAccountName(
        accountNumber: string,
        bankCode: string
    ) {
        const response: any = await axios.get(`${process.env.PAYSTACK_URL as string}/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_KEY}`
            },
        });

        if (!response.data.status) {
            throw new APIError(response.data.message || "Unable to resolve merchant fiat account", STATUS.conflict);
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
        if (account.profileId != profileId) {
            throw new APIError("Unauthorized", STATUS.unauthorized);
        }
        if(account.isPrimary){
            throw new APIError("Cannot delete primary account. Please set another account as primary before deleting this account.", STATUS.conflict);
        }
        await this.fiatRepository.deleteAccount(id);
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
        if (account.profileId != profileId) {
            throw new APIError("Unauthorized", STATUS.unauthorized);
        }
        if (account.isPrimary == isPrimary) {
            throw new APIError(`Account is already set to primary, ${isPrimary}`, STATUS.conflict);
        }
        await this.fiatRepository.updateAccount(id, isPrimary);
    }
}