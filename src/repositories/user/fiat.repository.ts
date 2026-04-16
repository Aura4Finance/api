import { Service } from "typedi";
import db from "@/config/db-config";

@Service()
export class FiatRepository {
    async findAccountById(profileId: string, id: string) {
        const account = await db.fiatAccount.findUnique({
            where: {
                id,
                profileId
            },
            select: {
                id: true,
                bankName: true,
                accountNumber: true,
                bankCode: true,
                accountName: true,
                profileId: true,
                isPrimary: true
            }
        });
        return account;
    }

    async getAccounts(profileId: string) {
        const accounts = await db.fiatAccount.findMany({
            where: {
                profileId
            },
            select: {
                id: true,
                bankName: true,
                accountNumber: true,
                bankCode: true,
                accountName: true,
                isPrimary: true
            }
        });
        return accounts;
    }

    async getAccountByBankCodeAndNumber(
        accountNumber: string,
        bankCode: string,
        profileId: string
    ) {
        const account = await db.fiatAccount.findFirst({
            where: {
                accountNumber,
                bankCode,
                profileId
            }
        });
        return account;
    }

    async getPrimaryAccount(profileId: string) {
        const primaryAccount = await db.fiatAccount.findUnique({
            where: {
                profileId_isPrimary: {
                    profileId,
                    isPrimary: true
                }
            }
        });
        return primaryAccount;
    }

    async createAccount(
        bankName: string,
        accountNumber: string,
        accountName: string,
        bankCode: string,
        isPrimary: boolean,
        profileId: string,
    ) {
        const account = await db.fiatAccount.create({
            data: {
                bankName,
                accountNumber,
                bankCode,
                accountName,
                profile: {
                    connect: {
                        id: profileId
                    }
                },
                isPrimary
            },
            select: {
                id: true,
                accountNumber: true,
                bankName: true,
                bankCode: true,
                accountName: true,
                isPrimary: true
            }
        })
        return account;

    }
    async updateAccount(
        id: string,
        profileId: string,
        isPrimary: boolean
    ) {
        return db.fiatAccount.update({
            where: { id },
            data: {
                isPrimary,
                profileId
            }
        })
    }

    async deleteAccount(
        id: string,
        profileId: string
    ) {
        return db.fiatAccount.delete({
            where: {
                id,
                profileId
            }
        })
    }
}