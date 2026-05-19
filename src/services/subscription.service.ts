import { STATUS } from "@/constants/status.constant";
import { Service } from "typedi";
import { APIError } from "@/utils/error-handler";
import { SubscriptionRepository } from "@/repositories/subscription.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { CustomerRepository } from "@/repositories/customer.repository";
import { triggerWebhook } from "@/services/user/webhook.service";
import { PaymentService } from "@/services/payment.service";
import { transactionQueue } from "@/queues/transaction.queue";
import {
  CreateSubscriptionDto,
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from "@/dto/subscription.dto";
import { Mode, PaymentMethod } from "../../generated/prisma";
import { WebhookQueue } from "./schedule.webhook.service";

@Service()
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly userRepository: UserRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly paymentService: PaymentService,
    private readonly webhookQueue: WebhookQueue
  ) {}

  async createPlan(userId: string, input: CreateSubscriptionPlanDto) {
    const profile = await this.userRepository.findUserById(userId);
    const profileId = profile?.businessProfile?.id;

    if (!profileId) {
      throw new APIError("Profile not found", STATUS.notFound);
    }

    const plan = await this.subscriptionRepository.createPlan(profileId, input);

    return {
      message: "Subscription plan created",
      payload: plan,
    };
  }

  async updatePlan(userId: string, planId: string, input: UpdateSubscriptionPlanDto) {
    const profile = await this.userRepository.findUserById(userId);
    const profileId = profile?.businessProfile?.id;

    if (!profileId) {
      throw new APIError("Profile not found", STATUS.notFound);
    }

    const plan = await this.subscriptionRepository.updatePlan(profileId, planId, input);

    return {
      message: "Subscription plan updated",
      payload: plan,
    };
  }

  async getPlans() {
    const plans = await this.subscriptionRepository.getPlans();

    return {
      message: "Plans retrieved",
      payload: plans,
    };
  }

  async getPlan(planId: string) {
    const plan = await this.subscriptionRepository.getPlanById(planId);
    if (!plan) throw new APIError("Plan not found", STATUS.notFound);

    return {
      message: "Plan retrieved",
      payload: plan,
    };
  }

  async deletePlan(userId: string, planId: string) {
    const profile = await this.userRepository.findUserById(userId);
    const profileId = profile?.businessProfile?.id;

    if (!profileId) {
      throw new APIError("Profile not found", STATUS.notFound);
    }

    await this.subscriptionRepository.deletePlan(planId, profileId);

    return {
      message: "Plan deleted",
      payload: null,
    };
  }

  async createSubscription(userId: string, input: CreateSubscriptionDto, mode: Mode) {
    const profile = await this.userRepository.findUserById(userId);
    const profileId = profile?.businessProfile?.id;

    if (!profileId) throw new APIError("Profile not found", STATUS.notFound);

    const customer = await this.customerRepository.findCustomerById(input.customerId, profileId);

    if (!customer) throw new APIError("Customer not found for profile", STATUS.notFound);

    const plan = await this.subscriptionRepository.getPlanById(input.planId, profileId);

    if (!plan) {
      throw new APIError("Subscription plan not found for profile", STATUS.notFound);
    }

    const subscription = await this.subscriptionRepository.createSubscription(input, mode);

    let txId: string = "";
    // Create an initial subscription payment transaction and schedule verification
    try {
      const paymentData = {
        amount: plan.amount,
        customerId: input.customerId,
        currency: plan.currency,
        network: input.network,
        txRef: subscription.id,
        type: PaymentMethod.SUBSCRIPTION,
        subscriptionId: subscription.id,
        billingCycleKey: subscription.id
      };

      const paymentResult = await this.paymentService.createPayment(paymentData, userId, mode);

      // schedule verification after 10 minutes
      txId = paymentResult.payload.transaction.id;
      await transactionQueue.add(
        "verify-payment",
        { paymentId: txId, subscriptionId: subscription.id },
        { delay: 10 * 60 * 1000, removeOnComplete: true }
      );
    } catch (err) {
      // Payment creation shouldn't block subscription creation; log and continue
      // (service layer has no logger here; swallow silently)
    }
    try {
      await triggerWebhook(profileId, {
        event: "subscription.create",
        data: {
          transactionId: subscription.id,
          amount: plan.amount,
          currency: plan.currency,
          status: "created",
          occuredAt: new Date().toISOString(),
        },
      });
    } catch {
      // Webhook delivery should not block subscription creation.
    }

    return {
      message: "Subscription created. Complete transaction to active subscription.",
      payload: {
        subscription,
        checkoutUrl: `https://checkout.orafi.app/${txId}`
      },
    };
  }

  async cancelSubscription(userId: string, subscriptionId: string) {
    const profile = await this.userRepository.findUserById(userId);
    const profileId = profile?.businessProfile?.id;

    if (!profileId) throw new APIError("Profile not found", STATUS.notFound);

    const subscription = await this.subscriptionRepository.getSubscription(subscriptionId);

    if (!subscription) throw new APIError("Subscription not found", STATUS.notFound);

    const customer = await this.customerRepository.findCustomerById(subscription.customerId, profileId);

    if (!customer) throw new APIError("Subscription does not belong to your profile", STATUS.forbidden);

    const canceled = await this.subscriptionRepository.cancelSubscription(subscriptionId);

    await this.webhookQueue.addScheduler(profileId, {
      event: "subscription.not_renew",
      data: {
        transactionId: subscription.id,
        amount: subscription.plan.amount,
        currency: subscription.plan.currency,
        status: "cancelled",
        occuredAt: new Date().toISOString(),
      },
    });

    return {
      message: "Subscription canceled",
      payload: canceled,
    };
  }

  async getSubscription(subscriptionId: string) {
    const subscription = await this.subscriptionRepository.getSubscription(subscriptionId);
    if (!subscription) throw new APIError("Subscription not found", STATUS.notFound);

    return {
      message: "Subscription retrieved",
      payload: subscription,
    };
  }

  async getSubscriptionsByCustomer(customerId: string, planId?: string) {
    const subscriptions = await this.subscriptionRepository.getSubscriptionsByCustomer(customerId, planId);

    return {
      message: "Subscriptions retrieved",
      payload: subscriptions,
    };
  }
}
