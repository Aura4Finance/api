import db from "@/config/db-config";
import { APIError } from "@/utils/error-handler";
import { SubscriptionDuration, SubscriptionStatus } from "../../generated/prisma";
import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";

export type CreateSubscriptionPlanInput = {
  name: string;
  duration: SubscriptionDuration;
  amount: number;
  currency: string;
};

export type UpdateSubscriptionPlanInput = Partial<CreateSubscriptionPlanInput>;

@Service()
export class SubscriptionRepository {
  private getPlanDurationEndDate(startsAt: Date, duration: SubscriptionDuration) {
    const endsAt = new Date(startsAt);

    switch (duration) {
      case "WEEKLY":
        endsAt.setDate(endsAt.getDate() + 7);
        break;
      case "MONTHLY":
        endsAt.setMonth(endsAt.getMonth() + 1);
        break;
      case "SIX_MONTHS":
        endsAt.setMonth(endsAt.getMonth() + 6);
        break;
      case "YEARLY":
        endsAt.setFullYear(endsAt.getFullYear() + 1);
        break;
      default:
        return null;
    }

    return endsAt;
  }

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
        profile: true,
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
        profile: true,
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

  async createSubscription(customerId: string, planId: string) {
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

    const activeSubscription = await db.subscription.findFirst({
      where: {
        customerId,
        planId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (activeSubscription) {
      throw new APIError("Customer already has an active subscription for this plan", STATUS.conflict);
    }

    const startsAt = new Date();
    const endsAt = this.getPlanDurationEndDate(startsAt, plan.duration);

    return db.subscription.create({
      data: {
        customerId,
        planId,
        startsAt,
        endsAt,
        status: SubscriptionStatus.ACTIVE,
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

  async getSubscriptionsByCustomer(customerId: string) {
    return db.subscription.findMany({
      where: { customerId },
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
