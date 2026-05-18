import db from "@/config/db-config";
import { APIError } from "@/utils/error-handler";
import { Mode, SubscriptionDuration, SubscriptionStatus } from "../../generated/prisma";
import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { CreateSubscriptionDto } from "@/dto/subscription.dto";

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
      include: {
        subscriptions: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getPlanById(planId: string, profileId?: string) {
    return db.subscriptionPlan.findFirst({
      where: profileId ? { id: planId, profileId } : { id: planId },
      include: {
        subscriptions: true,
      },
    });
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

  async createSubscription(data: CreateSubscriptionDto, mode: Mode) {
    const { 
      planId,
      customerId,
      network
    } = data;
    const plan = await db.subscriptionPlan.findUnique({
      where: { id: planId },
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
      },
    });

    if(existingSubscription){
      if (existingSubscription.status == SubscriptionStatus.ACTIVE) {
        throw new APIError("Customer already has an active subscription for this plan", STATUS.conflict);
      }else {
        return db.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            network,
            mode,
            status: SubscriptionStatus.PENDING,
            startsAt: new Date(),
        },
        include: {
          plan: true
        }
      })
      }
    }

    // Create as PENDING — activation happens after payment verification
    return db.subscription.create({
      data: {
        customerId,
        planId,
        network,
        mode,
        // startsAt will default to now (schema default). endsAt left null until activation.
        status: SubscriptionStatus.PENDING,
      },
      include: {
        customer: true,
        plan: true,
      },
    });
  }

  async cancelSubscription(subscriptionId: string) {
    const subscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
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

  async getSubscription(subscriptionId: string) {
    return db.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: true,
        plan: true,
      },
    });
  }

  async getSubscriptionsByCustomer(customerId: string, planId?: string) {
    return db.subscription.findMany({
      where: { 
        customerId,
        ...(planId ? { planId } : {}),
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

  async getSubscriptionsByPlan(planId: string) {
    return db.subscription.findMany({
      where: { planId },
      include: {
        customer: true,
        plan: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getActiveSubscriptions() {
    return db.subscription.findMany({
      where: {
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
