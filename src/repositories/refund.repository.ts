import db from "@/config/db-config";
import { Service } from "typedi";
import { RefundQueryDto } from "@/dto/refund.dto";
import { Mode, Network } from "@/generated/prisma/client";



@Service()
export class RefundRepository {
    async createRefund(
        amount: number,
        amountInUSDC: number,
        network: Network,
        currency: string,
        reason: string,
        originalTxId: string,
        walletAddress: string,
        customerId: string,
        profileId: string,
        mode: Mode
    ) {
        const transaction = await db.transaction.create({
            data: {
                type: "REFUND",
                status: "PENDING",
                amount,
                amountInUSDC,
                network,
                currency,
                mode,
                token: "USDC",
                profile: {
                    connect: { id: profileId },
                },
                customer: {
                    connect: { id: customerId },
                },
                refund: {
                    create: {
                        reason,
                        originalTxId,
                        walletAddress,
                    }
                }

            },
            select: {
                id: true,
            }
        });

        return transaction;
    }

    async confirmRefund(
        txId: string,
        txDigest: string
    ) {
        const tx = await db.transaction.update({
            where: {
                id: txId
            },
            data: {
                status: "COMPLETED",
                confirmedAt: new Date(),
                refund: {
                    update: {
                        txDigest
                    },
                },
            },
        });
        return tx;
    }

    async failRefund(
        txId: string,
        txDigest: string
    ) {
        const tx = await db.transaction.update({
            where: {
                id: txId
            },
            data: {
                status: "FAILED",
                refund: {
                    update: {
                        txDigest
                    },
                },
            },
        })
        return tx;
    }

    async getAllRefunds(
        query: RefundQueryDto,
        profileId?: string
    ) {
        const {
            status,
            walletAddress,
            customerId,
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
            type: "REFUND",
        };

        if (status) where.status = status;
        if (walletAddress) where.walletAddress = walletAddress;
        if (customerId) where.method = customerId;
        if (txDigest) where.txDigest = txDigest;

        // Handle amount or range (if "anount" is stored as string)
        if (minAmount || maxAmount) {
            where.AND = [];
            if (minAmount)
                where.AND.push({ anount: { gte: String(minAmount) } });
            if (maxAmount)
                where.AND.push({ anount: { lte: String(maxAmount) } });
        }

        const refunds = await db.transaction.findMany({
            where,
            take: Number(limit) + 1,
            ...(cursor && { cursor: { id: cursor }, skip: 1 }),
            orderBy: {
                refund: {
                    [sortBy]: sortOrder,
                }
            },
            include: {
                refund: true,
            },
        });

        let nextCursor: string | null = null;
        if (refunds.length > limit) {
            const nextItem = refunds.pop(); // remove extra record
            nextCursor = nextItem!.id;
        }

        return {
            refunds,
            nextCursor,
            hasNextPage: !!nextCursor,
        }
    }

    async getRefundById(txId: string, profileId: string) {
        const refund = await db.transaction.findUnique({
            where: {
                id: txId,
                profile: {
                    id: profileId
                }
            },
            include: {
                refund: true
            }
        });
        return refund;
    }
}