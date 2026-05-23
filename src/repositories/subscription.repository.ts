import db from "@/config/db-config";
import { APIError } from "@/utils/error-handler";
import { Mode, SubscriptionDuration, SubscriptionStatus } from "../../generated/prisma";
import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { CreateSubscriptionDto } from "@/dto/subscription.dto";

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export type CreateSubscriptionPlanInput = {
  name: string;
  duration: SubscriptionDuration;
  amount: number;
  currency: string;
};

export type UpdateSubscriptionPlanInput = Partial<CreateSubscriptionPlanInput>;

@Service()
export class SubscriptionRepository {
  

  async createPlan(profileId: string, data: CreateSubscriptionPlanInput) {
    const existingPlan = await db.subscriptionPlan.findFirst({
      where: {
        profileId,
        name: data.name,
        duration: data.duration,
      },
    });

    if (existingPlan) {
      throw new APIError("Subscription plan already exists", STATUS.conflict);
    }

    return db.subscriptionPlan.create({
      data: {
        profileId,
        name: data.name,
        duration: data.duration,
        amount: data.amount,
        currency: data.currency,
      },
    });
  }

  async updatePlan(profileId: string, planId: string, data: UpdateSubscriptionPlanInput) {
    const existingPlan = await db.subscriptionPlan.findFirst({
      where: { id: planId, profileId },
    });

    if (!existingPlan) {
      throw new APIError("Subscription plan not found", STATUS.notFound);
    }

    return db.subscriptionPlan.update({
      where: { id: planId },
      data,
    });
  }

  async getPlans(profileId?: string) {
    const where = profileId ? { profileId } : undefined;

    return db.subscriptionPlan.findMany({
      ...(where ? { where } : {}),
      orderBy: {
        createdAt: "desc",
      },
    });
  }

async getPlanById(planId: string, mode: Mode, profileId?: string) {
  const [plan, subscriptionCount] = await Promise.all([
    db.subscriptionPlan.findFirst({
      where: profileId ? { id: planId, profileId } : { id: planId },
      include: {
        subscriptions: {
          where: {
            mode
          },
          include: {
            customer: true
          }
        },
      },
    }),
    db.subscription.count({
      where: { 
        planId,
        mode
      }
    })
  ]);

  return { ...plan, subscriptionCount };
}

  async deletePlan(planId: string, profileId?: string) {
    const existingPlan = await db.subscriptionPlan.findFirst({
      where: profileId ? { id: planId, profileId } : { id: planId },
    });

    if (!existingPlan) {
      throw new APIError("Subscription plan not found", STATUS.notFound);
    }

    return db.subscriptionPlan.delete({
      where: { id: planId },
    });
  }

  async createSubscription(data: CreateSubscriptionDto, mode: Mode, profileId?: string) {
    const { 
      planId,
      customerId,
      network
    } = data;
    const plan = await db.subscriptionPlan.findUnique({
      where: { 
        id: planId,
        ...(profileId ? { profileId } : {})
      },
    });

    if (!plan) {
      throw new APIError("Subscription plan not found", STATUS.notFound);
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new APIError("Customer not found", STATUS.notFound);
    }

    const existingSubscription = await db.subscription.findFirst({
      where: {
        customerId,
        planId,
        plan: {
          ...(profileId ? { profileId } : {})
        }
      },
    });

    if(existingSubscription){
      if (existingSubscription.status == SubscriptionStatus.ACTIVE || existingSubscription.status == SubscriptionStatus.TRIALING) {
        throw new APIError("Customer already has an active subscription for this plan", STATUS.conflict);
      }else {
        const trialDays = Number(plan.trialDays ?? 0);
        const trialEndsAt = trialDays > 0 ? addDays(new Date(), trialDays) : null;
        return db.subscription.update({
          where: { 
            id: existingSubscription.id,
            mode,
            plan: {
              ...(profileId ? { profileId } : {})
            }
           },
          data: {
            network,
            mode,
            status: trialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.PENDING,
            updatedAt: new Date(),
            startsAt: new Date(),
            trialEndsAt,
            endsAt: null,
            canceledAt: null,
        },
        include: {
          plan: true
        }
      })
      }
    }

    // Create as PENDING — activation happens after payment verification
    const trialDays = Number(plan.trialDays ?? 0);
    const trialEndsAt = trialDays > 0 ? addDays(new Date(), trialDays) : null;
    return db.subscription.create({
      data: {
        customerId,
        planId,
        network,
        mode,
        // startsAt will default to now (schema default). endsAt left null until activation.
        status: trialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.PENDING,
        ...(trialEndsAt ? { trialEndsAt } : {}),
      },
      include: {
        customer: true,
        plan: true,
      },
    });
  }

  async cancelSubscription(subscriptionId: string, profileId?: string) {
    const subscription = await db.subscription.findUnique({
      where: { 
        id: subscriptionId,
        ...(profileId ? { plan: { profileId } } : {})
       },
      include: {
        customer: true,
        plan: true,
       },
    });

    if (!subscription) {
      throw new APIError("Subscription not found", STATUS.notFound);
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      return subscription;
    }

    return db.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        canceledAt: new Date(),
      },
      include: {
        customer: true,
        plan: true,
      },
    });
  }

  async getSubscription(mode: Mode, subscriptionId: string, profileId?: string) {
    return db.subscription.findUnique({
      where: { 
        id: subscriptionId,
        plan: {
          ...(profileId && { profileId })
        },
        mode
       },
      include: {
        customer: true,
        plan: {
          include: {
            profile: {
              select: {
                businessName: true
              }
            }
          }
        }
      },
    });
  }

  async getSubscriptionsByCustomer(mode: Mode, customerId: string, profileId?: string, planId?: string) {
    return db.subscription.findMany({
      where: { 
        customerId,
        mode,
        ...(planId ? { planId } : {}),
        plan: {
          ...(profileId ? { profileId } : {})
        }
      },
      include: {
        customer: true,
        plan: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getSubscriptionsByPlan(planId: string, profileId?: string) {
    return db.subscription.findMany({
      where: { 
        planId,
        plan: {
          ...(profileId ? { profileId } : {})
        }
      },
      include: {
        customer: true,
        plan: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getActiveSubscriptions(profileId: string) {
    return db.subscription.findMany({
      where: {
        plan: {
          profileId
        },
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        customer: true,
        plan: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

}
