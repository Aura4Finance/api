import { GetAllTransactionsDto } from "@/dto/transaction.dto";
import { Service } from "typedi";
import db from "@/config/db-config";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { Mode, TransactionStatus } from "../../generated/prisma";

@Service()
export class TransactionRepository {
  async getTransactionById(txId: string, profileId?: string) {
    return await db.transaction.findUnique({
      where: {
        id: txId,
      },
      ...(profileId && {
        where: {
          id: txId,
          profileId: profileId,
        },
      }),
      include: {
        customer: true,
        profile: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        payment: true,
        payout: true,
        refund: true,
      },
    });
  }

  async getAllTransactions(
    query: GetAllTransactionsDto,
    mode: Mode = Mode.test,
    profileId?: string
  ) {
    const {
      type,
      paymentLinkId,
      paymentMethod,
      status,
      currency,
      network,
      token,
      date,
      customerId,
      limit = 20,
      cursor,
    } = query;

    const where: any = { payment: {} };

    // Filter: type
    if (type) where.type = type;

    if(currency) where.currency = currency;

    if(network) where.network = network;

    // Filter: status
    if (status) where.status = status;

    // Filter: mode
    if (mode) where.mode = mode;

    // Filter: token
    if (token) where.token = token;

    // Filter: customerId or profileId
    if (customerId) where.customerId = customerId;
    if (profileId) where.profileId = profileId;
    if (paymentMethod) {
      if (type !== "PAYMENT")
        throw new APIError(
          "Invalid payment method for provided transaction type",
          STATUS.conflict
        );
      where.payment.paymentMethod = paymentMethod;
    }
    if (paymentMethod) {
      if (type !== "PAYMENT")
        throw new APIError(
          "Invalid payment method for provided transaction type",
          STATUS.conflict
        );
      where.payment.paymentLinkId = paymentLinkId;
    }

    // Filter: date interval
    if (date) {
      if (date.type === "preset") {
        where.createdAt = this.getPresetDateRange(date.interval);
      } else if (date.type === "range") {
        where.createdAt = {
          gte: new Date(date.startDate),
          lte: new Date(date.endDate),
        };
      }
    }

    const transactions = await db.transaction.findMany({
      where,
      take: Number(limit + 1),
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        profile: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        payment: {
          include: {
            wallet: {
              select: {
                address: true,
              },
            }
          }
        },
        payout: true,
        refund: true,
      },
    });
    let nextCursor: string | null = null;
    if (transactions.length > limit) {
      const nextItem = transactions.pop(); // remove extra record
      nextCursor = nextItem!.id;
    }
    const count = await db.transaction.count({
      where,
    });
    return {
      transactions,
      count,
      nextCursor,
      hasNextPage: !!nextCursor,
    };
  }

  private getPresetDateRange(interval: string) {
    const start = new Date();
    const end = new Date();

    switch (interval) {
      case "today":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;

      case "yesterday":
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;

      case "last7days":
        start.setDate(start.getDate() - 7);
        break;

      case "last30days":
        start.setDate(start.getDate() - 30);
        break;

      case "thisMonth":
        start.setDate(1);
        break;

      case "lastMonth":
        start.setMonth(start.getMonth() - 1, 1);
        end.setMonth(end.getMonth(), 0);
        break;

      case "thisYear":
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        break;
    }

    return {
      gte: start,
      lte: end,
    };
  }

  async getTransactionMetrics({
    status = TransactionStatus.COMPLETED,
    mode = Mode.live,
    days = 7,
    userId,
  }: {
    status?: TransactionStatus;
    mode?: Mode;
    days?: number;
    userId?: string;
  }) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(today.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const raw = await db.transaction.groupBy({
      by: ["createdAt"],
      where: {
        status,
        mode,
        ...(userId && { profileId: userId }),
        createdAt: {
          gte: startDate,
          lte: today,
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
        amountInUSDC: true,
      },
    });

    // Normalize by day
    const dailyMap = new Map<
      string,
      {
        count: number;
        volume: number;
        volumeInUSDC: number;
      }
    >();

    for (const row of raw) {
      const dayKey = row.createdAt.toISOString().split("T")[0];

      const existing = dailyMap.get(dayKey || "") ?? {
        count: 0,
        volume: 0,
        volumeInUSDC: 0,
      };

      dailyMap.set(dayKey || "", {
        count: existing.count + row._count._all,
        volume: existing.volume + (row._sum.amount ?? 0),
        volumeInUSDC: existing.volumeInUSDC + (row._sum.amountInUSDC ?? 0),
      });
    }

    // Fill missing days (important for charts)
    const result: Array<{
      date: string;
      label: string;
      count: number;
      volume: number;
      volumeInUSDC: number;
    }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const key = d.toISOString().split("T")[0];
      const data = dailyMap.get(key || "");

      result.unshift({
        date: key || "",
        label:
          i === 0
            ? "Today"
            : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: data?.count ?? 0,
        volume: data?.volume ?? 0,
        volumeInUSDC: data?.volumeInUSDC ?? 0,
      });
    }

    return result;
  }

  async getRevenueMetrics({
    mode = Mode.live,
    days = 7,
  }: {
    mode?: Mode;
    days?: number;
  }) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(today.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const raw = await db.transaction.groupBy({
      by: ["createdAt", "type"],
      where: {
        status: TransactionStatus.COMPLETED,
        mode,
        createdAt: {
          gte: startDate,
          lte: today,
        },
      },
      _sum: {
        amount: true,
        amountInUSDC: true,
      },
    });

    // Aggregate per day
    const dailyMap = new Map<
      string,
      {
        amount: number;
        amountInUSDC: number;
      }
    >();

    for (const row of raw) {
      const dayKey = row.createdAt.toISOString().split("T")[0];

      const multiplier = 0.01; // your conversion logic
      const amount = (row._sum.amount ?? 0) * multiplier;
      const amountInUSDC = (row._sum.amountInUSDC ?? 0) * multiplier;

      const existing = dailyMap.get(dayKey || "") ?? {
        amount: 0,
        amountInUSDC: 0,
      };

      dailyMap.set(dayKey || "", {
        amount: existing.amount + amount,
        amountInUSDC: existing.amountInUSDC + amountInUSDC,
      });
    }

    // Fill missing days
    const result: Array<{
      date: string;
      label: string;
      revenue: number;
      revenueInUSDC: number;
    }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const key = d.toISOString().split("T")[0];
      const data = dailyMap.get(key || "");

      result.unshift({
        date: key || "",
        label:
          i === 0
            ? "Today"
            : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: data?.amount ?? 0,
        revenueInUSDC: data?.amountInUSDC ?? 0,
      });
    }

    return result;
  }

  async calculateRevenueGenerated(mode: Mode = Mode.live) {
    const now = new Date();

    // Current month
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Last month
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999
    );

    const [currentPayment, currentPayout, lastPayment, lastPayout] =
      await Promise.all([
        // Current month payments
        db.transaction.aggregate({
          _sum: { amount: true, amountInUSDC: true },
          where: {
            type: "PAYMENT",
            status: TransactionStatus.COMPLETED,
            mode,
            createdAt: { gte: currentStart, lte: currentEnd },
          },
        }),
        // Current month payouts
        db.transaction.aggregate({
          _sum: { amount: true, amountInUSDC: true },
          where: {
            type: "PAYOUT",
            status: TransactionStatus.COMPLETED,
            mode,
            createdAt: { gte: currentStart, lte: currentEnd },
          },
        }),
        // Last month payments
        db.transaction.aggregate({
          _sum: { amount: true, amountInUSDC: true },
          where: {
            type: "PAYMENT",
            status: TransactionStatus.COMPLETED,
            mode,
            createdAt: { gte: lastStart, lte: lastEnd },
          },
        }),
        // Last month payouts
        db.transaction.aggregate({
          _sum: { amount: true, amountInUSDC: true },
          where: {
            type: "PAYOUT",
            status: TransactionStatus.COMPLETED,
            mode,
            createdAt: { gte: lastStart, lte: lastEnd },
          },
        }),
      ]);

    const currentRevenue =
      ((currentPayment._sum.amount || 0) + (currentPayout._sum.amount || 0)) *
      0.01;

    const lastRevenue =
      ((lastPayment._sum.amount || 0) + (lastPayout._sum.amount || 0)) * 0.01;

    let percentageChange = 0;

    if (lastRevenue > 0) {
      percentageChange = ((currentRevenue - lastRevenue) / lastRevenue) * 100;
    }

    return {
      amount: Number(currentRevenue.toFixed(2)),
      percentageChange: Number(percentageChange.toFixed(1)),
      trend: currentRevenue >= lastRevenue ? "up" : "down",
    };
  }

  async   countTransaction(mode: Mode = Mode.live, userId?: string) {
    const now = new Date();

    // Current month range
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,  
      23,
      59,
      59,
      999
    );

    // Last month range
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999
    );

    const [currentCount, lastCount] = await Promise.all([
      db.transaction.count({
        where: {
          mode,
          ...(userId && { profileId: userId }),
          createdAt: {
            gte: currentStart,
            lte: currentEnd,
          },
        },
      }),
      db.transaction.count({
        where: {
          mode,
          ...(userId && { profileId: userId }),
          createdAt: {
            gte: lastStart,
            lte: lastEnd,
          },
        },
      }),
    ]);

    let percentageChange = 0;

    if (lastCount > 0) {
      percentageChange = ((currentCount - lastCount) / lastCount) * 100;
    }

    return {
      total: currentCount,
      percentageChange: Number(percentageChange.toFixed(1)),
      trend: currentCount >= lastCount ? "up" : "down",
    };
  }

  async getTransactionCountByStatus(mode: Mode=Mode.live){
    const raw = await db.transaction.groupBy({
      by: ["status"],
      where: {
        mode,
      },
      _count: {
        _all: true,
      },
    });
    return {
      total: raw.reduce((sum, item) => sum + item._count._all, 0),
      successful: raw.find(item => item.status === "COMPLETED")?._count._all || 0,
      pending: raw.find(item => item.status === "PENDING")?._count._all || 0,
      failed: raw.find(item => item.status === "FAILED")?._count._all || 0,
    }
  }

  async getAverageRevenuePerMerchant(mode: Mode = Mode.live) {
    // Total completed transaction volume grouped by merchant
    const merchantRevenues = await db.transaction.groupBy({
      by: ["profileId"],
      where: {
        status: TransactionStatus.COMPLETED,
        mode,
      },
      _sum: {
        amount: true,
        amountInUSDC: true,
      },
      _count: {
        _all: true,
      },
    });

    const merchantCount = merchantRevenues.length;

    if (merchantCount === 0) {
      return {
        averageRevenue: 0,
        averageRevenueInUSDC: 0,
        averageTransactionCount: 0,
        totalMerchants: 0,
      };
    }

    const totalRevenue = merchantRevenues.reduce(
      (sum, m) => sum + (m._sum.amount ?? 0),
      0
    );
    const totalRevenueInUSDC = merchantRevenues.reduce(
      (sum, m) => sum + (m._sum.amountInUSDC ?? 0),
      0
    );
    const totalTransactions = merchantRevenues.reduce(
      (sum, m) => sum + m._count._all,
      0
    );

    return {
      averageRevenue: Number((totalRevenue / merchantCount).toFixed(2)),
      averageRevenueInUSDC: Number(
        (totalRevenueInUSDC / merchantCount).toFixed(2)
      ),
      averageTransactionCount: Number(
        (totalTransactions / merchantCount).toFixed(1)
      ),
      totalMerchants: merchantCount,
    };
  }

  async getMerchantTransactionVolume(userId: string, mode: Mode = Mode.live) {
    const volume = await db.transaction.aggregate({
      _sum: {
        amount: true,
        amountInUSDC: true,
      },
      _count: {
        _all: true,
      },
      where: {
        profileId: userId,
        mode,
        status: TransactionStatus.COMPLETED,
      },
    });

    return {
      totalVolume: Number((volume._sum.amount ?? 0).toFixed(2)),
      totalVolumeInUSDC: Number((volume._sum.amountInUSDC ?? 0).toFixed(2)),
      transactionCount: volume._count._all,
    };
  }

  async calculateMerchantEarnings(profileId: string, mode: Mode = Mode.live) {
    // Get all completed payments and refunds for this merchant (USDC only)
    const [payments, refunds] = await Promise.all([
      // All completed payments
      db.transaction.aggregate({
        _sum: { amountInUSDC: true },
        where: {
          profileId,
          mode,
          type: "PAYMENT",
          status: TransactionStatus.COMPLETED,
        },
      }),
      // All completed refunds
      db.transaction.aggregate({
        _sum: { amountInUSDC: true },
        where: {
          profileId,
          mode,
          type: "REFUND",
          status: TransactionStatus.COMPLETED,
        },
      }),
    ]);

    const paymentAmountUSDC = payments._sum.amountInUSDC ?? 0;
    const refundAmountUSDC = refunds._sum.amountInUSDC ?? 0;
    const netAmountUSDC = paymentAmountUSDC - refundAmountUSDC;

    // Calculate 99% (after 1% fee)
    const earningsUSDC = Number((netAmountUSDC * 0.99).toFixed(2));

    return {
      earningsUSDC,
      grossEarningsUSDC: Number(netAmountUSDC.toFixed(2)),
      totalPaymentsUSDC: Number(paymentAmountUSDC.toFixed(2)),
      totalRefundsUSDC: Number(refundAmountUSDC.toFixed(2)),
      platformFeeUSDC: Number((netAmountUSDC * 0.01).toFixed(2)),
    };
  }
}
