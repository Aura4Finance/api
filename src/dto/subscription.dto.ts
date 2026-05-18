import { Network, SubscriptionDuration } from "../../generated/prisma";

export type CreateSubscriptionPlanDto = {
  name: string;
  duration: SubscriptionDuration;
  amount: number;
  currency: string;
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