import db from "@/config/db-config";
import { Service } from "typedi";
import { Network } from "../../../generated/prisma";

@Service()
export class SettlementRepository {
  async findSettlemtAccountByAddress(
    walletAddress: string,
    network: Network,
    businessProfileId: string
  ) {
    return await db.cryptoAccount.findFirst({
      where: {
        AND: [{ walletAddress }, { profileId: businessProfileId }, { network }],
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
        network: true,
      }
    });
  }

  async addSettlementAccount(
    walletAddress: string, 
    network: Network, 
    alias: string,
    businessProfileId: string) {
   return  await db.cryptoAccount.create({
      data: {
        walletAddress,
        alias,
        network,
        profile: {
          connect: {
            id: businessProfileId,
          },
        },
      },
      select: {
        id: true,
        walletAddress: true,
        network: true,
      }
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
