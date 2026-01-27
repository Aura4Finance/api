import db from "@/config/db-config";
import { Service } from "typedi";

@Service()
export class SettlementRepository {
  async findSettlemtAccountByAddress(
    walletAddress: string,
    businessProfileId: string
  ) {
    return await db.cryptoAccount.findFirst({
      where: {
        AND: [{ walletAddress }, { profileId: businessProfileId }],
      },
    });
  }

  async findSettlemtAccountById(accountId: string, businessProfileId: string) {
    return await db.cryptoAccount.findFirst({
      where: {
        AND: [{ id: accountId }, { profileId: businessProfileId }],
      },
      select: {
        id: true,
        walletAddress: true,
      }
    });
  }

  async addSettlementAccount(walletAddress: string, businessProfileId: string) {
    await db.cryptoAccount.create({
      data: {
        walletAddress,
        profile: {
          connect: {
            id: businessProfileId,
          },
        },
      },
    });
  }

  async getAllSettlementAccounts(businessProfileId: string) {
    return await db.cryptoAccount.findMany({
      where: {
        profileId: businessProfileId,
      },
    });
  }

  async deleteSettlementAccount(accountId: string) {
    await db.cryptoAccount.delete({
      where: {
        id: accountId,
      },
    });
  }
}
