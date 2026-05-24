import { STATUS } from "@/constants/status.constant";
import { Service } from "typedi";
import { APIError } from "@/utils/error-handler";
import { SubscriptionRepository } from "@/repositories/subscription.repository";
import { CustomerRepository } from "@/repositories/customer.repository";
import { PaymentService } from "@/services/payment.service";
import { jobs, transactionQueue } from "@/queues/transaction.queue";
import {
  CreateSubscriptionDto,
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from "@/dto/subscription.dto";
import { Mode, PaymentMethod } from "../../generated/prisma";
import { WebhookQueue } from "./schedule.webhook.service";
import { CreatePaymentDto } from "@/dto/payment.dto";
import crypto from "crypto";
import { EmailQueue } from "./schedule.email.service";
import logger from "@/utils/logger";

const CHECKOUT_BASE_URL = "https://checkout.orafi.app";

@Service()
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly paymentService: PaymentService,
    private readonly webhookQueue: WebhookQueue,
    private readonly emailQueue: EmailQueue
  ) {}

  async createPlan(profileId: string, data: CreateSubscriptionPlanDto) {
    const plan = await this.subscriptionRepository.createPlan(profileId, data);

    return {
      message: "Subscription plan created",
      payload: plan,
    };
  }

  async updatePlan(profileId: string, planId: string, input: UpdateSubscriptionPlanDto) {
    const plan = await this.subscriptionRepository.updatePlan(profileId, planId, input);

    return {
      message: "Subscription plan updated",
      payload: plan,
    };
  }

  async getPlans(profileId: string) {
    const plans = await this.subscriptionRepository.getPlans(profileId);
    return {
      message: "Plans retrieved",
      payload: plans,
    };
  }

  async getPlan(profileId: string, planId: string, mode: Mode) {
    const plan = await this.subscriptionRepository.getPlanById(planId, mode, profileId);
    if (!plan) throw new APIError("Plan not found", STATUS.notFound);

    return {
      message: "Plan retrieved",
      payload: plan,
    };
  }

  async deletePlan(profileId: string, planId: string) {
    await this.subscriptionRepository.deletePlan(planId, profileId);

    return {
      message: "Plan deleted",
      payload: null,
    };
  }

  async createSubscription(profileId: string, input: CreateSubscriptionDto, mode: Mode) {
    const customer = await this.customerRepository.findCustomerById(input.customerId, profileId);

    if (!customer) throw new APIError("Customer not found for profile", STATUS.notFound);

    const plan = await this.subscriptionRepository.getPlanById(input.planId, mode, profileId);

    if (!plan) {
      throw new APIError("Subscription plan not found for profile", STATUS.notFound);
    }

    const subscription = await this.subscriptionRepository.createSubscription(input, mode);
    const hasTrial = Number(plan.trialDays ?? 0) > 0;

    let txId: string = "";
    if (!hasTrial) {
      // Create an initial subscription payment transaction and schedule verification
      try {
        const paymentData: CreatePaymentDto = {
          amount: <number>plan.amount,
          customerId: input.customerId,
          currency: <string>plan.currency,
          network: input.network,
          txRef: `${crypto.randomBytes(4).toString("hex").slice(0,7)}-${subscription.id}`,
          type: PaymentMethod.SUBSCRIPTION,
          subscriptionId: subscription.id,
        };

        const paymentResult = await this.paymentService.createPayment(paymentData, profileId, mode);

        // schedule verification after 10 minutes
        txId = paymentResult.payload.transaction.id;
        await transactionQueue.add(
          jobs.VERIFY_INITIAL_SUBSCRIPTION_PAYMENT,
          { paymentId: txId, subscriptionId: subscription.id, failureEmailTemplate: "abandoned" },
          {
            delay: 10 * 60 * 1000,
            removeOnComplete: true,
            jobId: `verify-initial-subscription-payment_${subscription.id}`,
          }
        );
      } catch (err: any) {
        logger.error(`Failed to create initial payment transaction for subscription(${subscription.id}). Reason: ${err?.message}`)
      }
    }
    try {
      await this.webhookQueue.addScheduler(profileId, {
        event: "subscription.create",
        data: {
          transactionId: subscription.id,
          amount: <number>plan.amount,
          currency: <string>plan.currency,
          status: "created",
          occuredAt: new Date().toISOString(),
        },
      });
    } catch {
      // Webhook delivery should not block subscription creation.
    }

    return {
      message: hasTrial
        ? "Subscription created. Free trial started."
        : "Subscription created. Complete transaction to active subscription.",
      payload: {
        subscription,
        ...(txId ? { checkoutUrl: `${CHECKOUT_BASE_URL}/${txId}` } : {}),
      },
    };
  }

  async cancelSubscription(profileId: string, subscriptionId: string, mode: Mode) {
    const subscription = await this.subscriptionRepository.getSubscription(mode, subscriptionId, profileId);

    if (!subscription) throw new APIError("Subscription not found", STATUS.notFound);

    const customer = await this.customerRepository.findCustomerById(subscription.customerId, profileId);

    if (!customer) throw new APIError("Subscription does not belong to your profile", STATUS.forbidden);

    const canceled = await this.subscriptionRepository.cancelSubscription(subscriptionId);

    try{
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

      await this.emailQueue.addSubscriptionCancelledScheduler({
          email: customer.email,
          customerName: customer.firstname,
          merchantName: subscription.plan.profile?.businessName ??  "",
          planName: subscription.plan.name,
          duration: String(subscription.plan.duration),
          cancelledAt: new Date().toISOString(),
          expiresAt: subscription.endsAt?.toISOString() ?? "",
      })
    }catch{}

    return {
      message: "Subscription canceled",
      payload: canceled,
    };
  }

  async getSubscription(mode: Mode, subscriptionId: string, profileId?: string) {
    const subscription = await this.subscriptionRepository.getSubscription(mode, subscriptionId, profileId);
    if (!subscription) throw new APIError("Subscription not found", STATUS.notFound);

    return {
      message: "Subscription retrieved",
      payload: subscription,
    };
  }

  async getSubscriptionsByCustomer(mode: Mode, customerId: string, planId?: string, profileId?: string) {
    const subscriptions = await this.subscriptionRepository.getSubscriptionsByCustomer(mode, customerId, profileId, planId);

    return {
      message: "Subscriptions retrieved",
      payload: subscriptions,
    };
  }
}
