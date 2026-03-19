import db from "@/config/db-config";
import { Service } from "typedi";
import { Mode, Network, PayOutMethod, TransactionStatus } from "../../generated/prisma";
import { PayoutQueryDto } from "@/dto/payout.dto";

@Service()
export class PayoutRepository {
  async createCryptoPayout(
    network: Network,
    amount: number,
    amountInUSDC: number,
    method: PayOutMethod,
    walletAddress: string,
    userId: string,
    mode: Mode,
    settlementAccountId?: string
  ) {
    let data: any = {
        type: "PAYOUT",
        status: "PENDING",
        mode,
        currency: "-",
        network,
        amount,
        amountInUSDC,
        token: "USDC",
        profile: {
          connect: { id: userId },
        },
        payout: {
          create: {
            method,
            walletAddress
          }
        }
      }
      if(settlementAccountId) {
        data.payout.create.cryptoAccount = {
          connect: {
            id: settlementAccountId
          }
        }
      }
    const tx = await db.transaction.create({
      data,
      select: { 
        id: true 
      },
    });
    
    return tx;
  }

  async createFiatPayout() {

  }

  async confirmPayout(
    txId: string,
    txDigest: string
  ) {
    const tx = await db.transaction.update({
      where: {
        id: txId,
      },
      data: {
        status: TransactionStatus.COMPLETED,
        confirmedAt: new Date(),
        payout: {
          update: {
            txDigest
          },
        },
      }
    });
    return tx;
  }

  async failPayout(
    txId: string,
    txDigest: string
  ) {
    const tx = await db.transaction.update({
      where: {
        id: txId,
      },
      data: {
        status: TransactionStatus.FAILED,
        payout: {
          update: {
            txDigest
          },
        },
      }
    })
    return tx;
  }

  async getAllPayouts(
    query: PayoutQueryDto,
    profileId?: string
  ) {
    const {
      status,
      walletAddress,
      method,
      txDigest,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      cursor,
      limit = 20,
    } = query;

    const where: any = {
      profileId,
      type: "PAYOUT",
    };

    if (status) where.status = status;
    if (walletAddress) where.walletAddress = walletAddress;
    if (method) where.method = method;
    if (txDigest) where.txDigest = txDigest;

    // Handle amount or range (if "anount" is stored as string)
    if (minAmount || maxAmount) {
      where.AND = [];
      if (minAmount)
        where.AND.push({ anount: { gte: String(minAmount) } });
      if (maxAmount)
        where.AND.push({ anount: { lte: String(maxAmount) } });
    }

    const txs = await db.transaction.findMany({
      where,
      take: Number(limit) + 1, // fetch 1 more to detect next page
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: {
        payout: {
          [sortBy]: sortOrder,
        }
      },
      include: {
        profile: {
          select: {
            id: true,
            businessName: true,
            country: true,
          },
        },
        payout: true,
      },
    });

    let nextCursor: string | null = null;
    if (txs.length > limit) {
      const nextItem = txs.pop(); // remove extra record
      nextCursor = nextItem!.id;
    }

    return {
      txs,
      nextCursor,
      hasNextPage: !!nextCursor,
    };
  }
  async getPayoutById(txId: string, userId: string) {
    const payout = await db.transaction.findFirst({
      where: {
        id: txId,
        profile: {
          userId
        }
      },
      include: {
        payout: true,
      }
    });
    return payout;
  }

}