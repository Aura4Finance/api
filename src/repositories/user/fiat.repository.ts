import { Service } from "typedi";
import db from "@/config/db-config";

@Service()
export class FiatRepository {
    async findAccountById(id: string) {
        const account = await db.fiatAccount.findUnique({
            where: {
                id
            },
            select: {
                bankName: true,
                accountNumber: true,
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
                isPrimary: true
            }
        });
        return accounts;
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
        bankCode: string,
        isPrimary: boolean,
        profileId: string,
    ) {
        const account = await db.fiatAccount.create({
            data: {
                bankName,
                accountNumber,
                bankCode,
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
                bankName: true
            }
        })
        return account;

    }
    async updateAccount(
        id: string,
        isPrimary: boolean
    ) {
        return db.fiatAccount.update({
            where: { id },
            data: {
                isPrimary
            }
        })
    }

    async deleteAccount(
        id: string
    ) {
        return db.fiatAccount.delete({
            where: { id }
        })
    }
}