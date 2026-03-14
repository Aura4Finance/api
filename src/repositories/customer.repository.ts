import db from "@/config/db-config";
import { STATUS } from "@/constants/status.constant";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import { Mode } from "../../generated/prisma";
import { GetCustomersQueryDto } from "@/dto/customer.dto";

@Service()
export class CustomerRepository {
  async findCustomerbyEmailorId(emailOrId: string, profileId?: string) {

    const where: any = {
      customer: {
          OR: [
            { email: emailOrId },
            { id: emailOrId },
          ],
        },
    }

    if(profileId){
      where.profileId = profileId
    }

    const result = await db.userCustomer.findFirst({
      where,
      include: {
        customer: true,
      },
    });

    return result;
  }

  async findCustomer(email: string) {
    const result = await db.customer.findFirst({
      where: {
        email,
      },
    });

    return result;
  }

  async createCustomer(
    firstname: string,
    lastname: string,
    email: string,
    profileId: string,
    mode: Mode
  ) {
    const existingCustomer = await this.findCustomer(email);

    if (existingCustomer) {
      const existingLink = await db.userCustomer.findFirst({
        where: {
          profileId,
          customerId: existingCustomer.id,
        },
      });

      if (existingLink) {
        throw new APIError("Customer already exists", STATUS.conflict);
      }

      try {
        await db.userCustomer.create({
          data: {
            profileId,
            customerId: existingCustomer.id,
          },
        });
      } catch (err: any) {
        // ignore duplicate-key errors (concurrent create by another process)
        if (!/duplicate/i.test(String(err.message))) {
          throw err;
        }
      }

      return existingCustomer;
    }

    const result = await db.customer.create({
      data: {
        firstname,
        lastname,
        email,
        mode: [mode],
        userCustomers: {
          create: {
            profileId,
          },
        },
      },
    });

    return result;
  }

  private mapAmountSpent(amount?: GetCustomersQueryDto["amountSpent"]) {
    if (!amount) return undefined;

    switch (amount) {
      case "BELOW10USDT":
        return { lt: 10 };

      case "FROM10TO30USDT":
        return { gte: 10, lte: 30 };

      case "FROM30TO100USDT":
        return { gte: 30, lte: 100 };

      case "FROM100TO200USDT":
        return { gte: 100, lte: 200 };

      case "FROM200TO500USDT":
        return { gte: 200, lte: 500 };

      case "ABOVE500USDT":
        return { gt: 500 };

      default:
        return undefined;
    }
  }


  async getAllCustomers(
    query: GetCustomersQueryDto,
    mode: Mode = Mode.test,
    userId?: string,
  ) {
    const {
      amountSpent,
      limit = 20,
      cursor
    } = query;

    const where: any = {};
    const include: any = {};

    // Scope customer to user
    if (userId) {
      where.userCustomers = {
        some: {
          profileId: userId,
        },
      };

      include.userCustomers = {
        where: {
          profileId: userId
        },
        select: {
          createdAt: true,
        },
      }
    } else {
      include.userCustomers = {
        select: {
          createdAt: true
        }
      }
    }


    // Mode filter
    if (mode) {
      where.mode = {
        has: mode,
      };
    }

    // Amount spent filter
    const amountRange = this.mapAmountSpent(amountSpent);
    if (amountRange) {
      where.totalSpent = amountRange;
    }

    const customers = await db.customer.findMany({
      where,
      take: Number(limit + 1),
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      include
    });

    let nextCursor: string | null = null;

    if (customers.length > limit) {
      const nextItem = customers.pop();
      nextCursor = nextItem!.id;
    }

    const count = await db.customer.count({
      where,
    });

    return {
      customers,
      count,
      nextCursor,
      hasNextPage: !!nextCursor,
    };
  }


  async findCustomerById(customerId: string, profileId?: string) {
    let where: any = {}

    if (profileId) {
      where.userCustomers = {
        some: {
          profileId,
          customerId,
        },
      }
    } else {
      where.userCustomers = {
        some: {
          customerId
        }
      }
    }


    const result = await db.customer.findFirst({
      where,
      include: {
        userCustomers: {
          select: {
            createdAt: true,
          },
        },
      },
    });

    return result;
  }

  async findAllCustomerRecords(customerId: string) {
    const result = await db.userCustomer.findMany({
      where: {
        customerId,
      },
    });

    return result;
  }

  async addModeToCustomer(
    customerId: string,
    modeToAdd: Mode
  ) {
    return db.$transaction(async (tx) => {
      // 1. Get current modes
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { mode: true },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // 2. Avoid duplicates
      if (customer.mode.includes(modeToAdd)) {
        return customer; // already has this mode
      }

      // 3. Update safely
      return tx.customer.update({
        where: { id: customerId },
        data: {
          mode: {
            set: [...customer.mode, modeToAdd],
          },
        },
      });
    });
  }


  async disconnectCustomerFromUser(userId: string, customerId: string) {
    await db.userCustomer.delete({
      where: {
        profileId_customerId: {
          profileId: userId,
          customerId,
        },
      },
    });
  }

  async deleteCustomer(customerId: string, userId: string) {
    await db.$transaction(async (tx) => {
      const currentCount = await tx.userCustomer.count({
        where: { customerId },
      });

      // always attempt to delete the relation safely
      await tx.userCustomer.deleteMany({
        where: {
          profileId: userId,
          customerId,
        },
      });

      // if this user was the last one, delete the customer
      if (currentCount === 1) {
        await tx.customer.delete({
          where: { id: customerId },
        });
      }
    });
  }

  async updateAmountSpent(
    customerId: string,
    amount: number,
    type: "add" | "remove" = "add"
  ) {
    return await db.customer.update({
      where: { id: customerId },
      data: {
        totalSpent: type == "add" ? { increment: amount } : { decrement: amount }
      }
    })

  }

  async countCustomers(mode: Mode = Mode.live, userId?: string) {
    const now = new Date();

    // Current month
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Last month
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const where: any = {
      mode: {
        has: mode
      }
    };

    if (userId) {
      where.userCustomers = {
        some: {
          profileId: userId,
        },
      };
    }

    const [currentCount, lastCount] = await Promise.all([
      db.customer.count({
        where: {
          ...where,
          createdAt: {
            gte: currentStart,
            lte: currentEnd
          }
        }
      }),
      db.customer.count({
        where: {
          ...where,
          createdAt: {
            gte: lastStart,
            lte: lastEnd
          }
        }
      })
    ]);

    let percentageChange = 0;

    if (lastCount > 0) {
      percentageChange =
        ((currentCount - lastCount) / lastCount) * 100;
    }

    return {
      total: currentCount,
      percentageChange: Number(percentageChange.toFixed(1)),
      trend: currentCount >= lastCount ? "up" : "down"
    };
  }

}
