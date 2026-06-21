import { Network, SubscriptionDuration } from "@/generated/prisma/client";

export type CreateSubscriptionPlanDto = {
  name: string;
  duration: SubscriptionDuration;
  amount: number;
  currency: string;
  trialDays?: number;
};

export type UpdateSubscriptionPlanDto = Partial<CreateSubscriptionPlanDto>;

export type CreateSubscriptionDto = {
  customerId: string;
  planId: string;
  network: Network;
};

export type GetSubscriptionsDto = {
   customerId: string;
   planId?: string;
}