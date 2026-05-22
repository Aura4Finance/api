import db from "@/config/db-config";
import { Service } from "typedi";
import { Network } from "../../../generated/prisma";

@Service()
export class SettlementRepository {
  async findSettlemtAccountByAddress(
    walletAddress: string,
    network: Network,
    profileId: string
  ) {
    return await db.cryptoAccount.findFirst({
      where: {
        AND: [{ walletAddress }, { profileId }, { network }],
      },
    });
  }

  async findSettlementAccountById(accountId: string, profileId: string) {
    return await db.cryptoAccount.findFirst({
      where: {
        AND: [{ id: accountId }, { profileId }],
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
    profileId: string) {
   return  await db.cryptoAccount.create({
      data: {
        walletAddress,
        alias,
        network,
        profile: {
          connect: {
            id: profileId,
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

  async getAllSettlementAccounts(profileId: string) {
    return await db.cryptoAccount.findMany({
      where: {
        profileId,
      },
    });
  }

  async deleteSettlementAccount(accountId: string, profileId: string) {
    await db.cryptoAccount.delete({
      where: {
        id: accountId,
        profileId
      },
    });
  }
}
