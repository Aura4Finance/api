import { Service } from "typedi";
import db from "../../config/db-config";
import { OnboardUserDto } from "@/dto/user.dto";
import { getAllMerchantsDto } from "@/dto/merchant.dto";
import { Provider } from "@generated/prisma";

@Service()
export class UserRepository {
  async findUserById(id: string) {
    const user = await db.user.findUnique({
      where: {
        id,
      },
      include: {
        businessProfile: {
          include: {
            wallet: {
              select: {
                address: true,
                derivationIndex: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  async findUserByIdAndUpdate2FA(userId: string, secret: string) {
    await db.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: true,
      },
    });
  }

  async findUserByEmail(email: string) {
    const user = await db.user.findUnique({
      where: { email },
      include: {
        businessProfile: {
          select: {
            id: true,
            isLive: true,
            onboarded: true,
            businessName: true,
            businessSector: true,
            country: true,
            websiteLink: true,
            wallet: {
              select: {
                address: true,
                derivationIndex: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  async findUserByAddress(address: string) {
    const user = await db.user.findFirst({
      where: {
        businessProfile: {
          wallet: {
            some: {
              address,
            },
          },
        },
      },
      include: {
        businessProfile: {
          include: {
            wallet: {
              select: {
                address: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  async verifyEmail(userId: string) {
    await db.user.update({
      where: {
        id: userId,
      },
      data: {
        emailVerified: true,
      },
    });
  }

  async changePassword(userId: string, password: string) {
    await db.user.update({
      where: {
        id: userId,
      },
      data: {
        password,
      },
    });
  }

  async changeEmail(userId: string, email: string) {
    await db.user.update({
      where: {
        id: userId,
      },
      data: {
        email,
      },
    });
  }

  async onboardUser(userId: string, data: OnboardUserDto) {
    await db.businessProfile.update({
      where: {
        userId,
      },
      data: {
        ...data,
        onboarded: true,
      },
    });
  }

  async changeBusinessMode(userId: string, isLive: boolean) {
    await db.businessProfile.update({
      where: {
        userId,
      },
      data: {
        isLive: !isLive,
      },
    });
  }

  async createMerchant(
    firstname: string,
    lastname: string,
    email: string,
    hashedPassword: string,
    address: string,
    derivationIndex: number,
    provider: Provider,
    googleId?: string
  ) {
    const user = await db.user.create({
      data: {
        firstname,
        lastname,
        email,
        password: hashedPassword,
        role: "MERCHANT",
        provider,
        googleId: googleId ? googleId : null,
        businessProfile: {
          create: {
            businessName: "",
            businessSector: "",
            country: "",
            websiteLink: "",
            wallet: {
              create: {
                address,
                derivationIndex,
              },
            },
          },
        },
      },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        businessProfile: true,
      },
    });

    return user;
  }

  async createAdmin(
    firstname: string,
    lastname: string,
    email: string,
    hashedPassword: string
  ) {
    const user = await db.user.create({
      data: {
        firstname,
        lastname,
        email,
        provider: "LOCAL",
        password: hashedPassword,
        role: "ADMIN",
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
    return user;
  }

  async findAllMerchants(query: getAllMerchantsDto) {
    const {
      country,
      businessSector,
      onboarded,
      disabled,
      search,
      countryList,
      sortBy = "businessName",
      sortOrder = "asc",
      limit = 20,
      cursor,
    } = query;

    const where: any = {
      role: {
        equals: "MERCHANT",
      },
      businessProfile: {},
    };
    if (country) where.businessProfile.country = country;
    if (businessSector) where.businessProfile.businessSector = businessSector;
    if (onboarded !== undefined)
      where.businessProfile.onboarded = onboarded === true;
    if (countryList)
      where.businessProfile.country = { in: countryList.split(",") };

    if (disabled !== undefined) {
      where.disabled = disabled === true;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        {
          businessProfile: {
            firstName: { contains: search, mode: "insensitive" },
          },
        },
        {
          businessProfile: {
            lastName: { contains: search, mode: "insensitive" },
          },
        },
        {
          businessProfile: {
            businessName: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    const merchants = await db.user.findMany({
      where,
      take: Number(limit) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: {
        businessProfile: { [sortBy]: sortOrder },
      },
      select: {
        id: true,
        email: true,
        disabled: true,
        emailVerified: true,
        role: true,
        businessProfile: {
          select: {
            businessName: true,
            businessSector: true,
            country: true,
            wallet: {
              select: {
                address: true,
              }
            }
          },
        },
      },
    });
    const hasNextPage = merchants.length > limit;
    const nextCursor = hasNextPage ? merchants.pop()?.id : null;
    const count = await db.user.count({ where });

    return { merchants, count, hasNextPage, nextCursor };
  }

  async updateUserStatus(userId: string, disabled: boolean) {
    const updatedUser = await db.user.update({
      where: {
        id: userId,
      },
      data: {
        disabled,
      },
    });
    return updatedUser;
  }

  async merchantStats() {
    const total = await db.user.count({
      where: {
        role: "MERCHANT",
        disabled: false,
      },
    });

    const onboarded = await db.user.count({
      where: {
        role: "MERCHANT",
        businessProfile: {
          onboarded: true,
        },
        disabled: false,
      },
    });

    const live = await db.user.count({
      where: {
        role: "MERCHANT",
        businessProfile: {
          isLive: true,
        },
        disabled: false,
      },
    });

    return { total, live, onboarded };
  }

  async countMerchants() {
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
      db.user.count({
        where: {
          role: "MERCHANT",
          createdAt: {
            gte: currentStart,
            lte: currentEnd,
          },
        },
      }),
      db.user.count({
        where: {
          role: "MERCHANT",
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

  async getTopMerchants(limit = 10) {
    // 1. Aggregate transactions per merchant
    const transactionAgg = await db.transaction.groupBy({
      by: ["profileId"],
      where: {
        status: "COMPLETED",
      },
      _sum: {
        amountInUSDC: true,
      },
      _count: {
        _all: true,
      },
    });

    // 2. Get active customers per merchant
    const customersAgg = await db.userCustomer.groupBy({
      by: ["profileId"],
      _count: {
        customerId: true,
      },
    });

    // 3. Map customers by profileId
    const customerMap = new Map(
      customersAgg.map((c) => [c.profileId, c._count.customerId])
    );

    // 4. Combine metrics
    const merchantMetrics = transactionAgg.map((t) => {
      const activeCustomers = customerMap.get(t.profileId) || 0;

      return {
        profileId: t.profileId,
        totalVolume: t._sum.amountInUSDC ?? 0,
        transactionCount: t._count._all,
        activeCustomers,
        score:
          (t._sum.amountInUSDC ?? 0) * 0.6 +
          t._count._all * 0.3 +
          activeCustomers * 0.1,
      };
    });

    // 5. Sort and take top 10
    const topMerchants = merchantMetrics
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // 6. Fetch merchant details
    const profiles = await db.businessProfile.findMany({
      where: {
        id: {
          in: topMerchants.map((m) => m.profileId),
        },
      },
      select: {
        id: true,
        businessName: true,
        country: true,
        isLive: true,
      },
    });

    // 7. Merge data
    return topMerchants.map((m) => ({
      ...m,
      profile: profiles.find((p: { id: string }) => p.id === m.profileId),
    }));
  }

  async getMerchantsOnboardedLast10Days() {
    const days = 10;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(today.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const raw = await db.user.groupBy({
      by: ["createdAt"],
      where: {
        role: "MERCHANT",
        businessProfile: {
          onboarded: true,
        },
        createdAt: {
          gte: startDate,
          lte: today,
        },
      },
      _count: {
        _all: true,
      },
    });

    // Normalize by day
    const dailyMap = new Map<string, number>();

    for (const row of raw) {
      const dayKey = row.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(dayKey || "") ?? 0;
      dailyMap.set(dayKey || "", existing + row._count._all);
    }

    // Fill missing days
    const result: Array<{
      date: string;
      label: string;
      count: number;
    }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const key = d.toISOString().split("T")[0];

      result.unshift({
        date: key || "",
        label:
          i === 0
            ? "Today"
            : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: dailyMap.get(key || "") ?? 0,
      });
    }

    return result;
  }

  async findMerchantByEmailIdOrPubKey(emailIdOrPubKey: string) {
    const user = await db.user.findFirst({
      where: {
        role: "MERCHANT",
        OR: [
          { id: emailIdOrPubKey },
          { email: emailIdOrPubKey },
          {
            businessProfile: {
              wallet: {
                some: { address: emailIdOrPubKey },
              },
            },
          },
        ],
      },
      include: {
        businessProfile: {
          include: {
            wallet: {
              select: {
                address: true,
              },
            },
          },
        },
      },
    });

    return user;
  }
}
