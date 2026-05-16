import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { SubscriptionService } from "@/services/subscription.service";
import { CreateSubscriptionDto, CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from "@/dto/subscription.dto";

@Service()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async createPlan(req: RequestAuth, res: Response) {
    const body = req.body as CreateSubscriptionPlanDto;
    const userId = req.user?.id as string;
    const { message, payload } = await this.subscriptionService.createPlan(userId, body);
    return res.status(STATUS.created).json({ success: true, message, data: payload });
  }

  async updatePlan(req: RequestAuth, res: Response) {
    const planId = req.params.planId as string;
    const body = req.body as UpdateSubscriptionPlanDto;
    const userId = req.user?.id as string;
    const { message, payload } = await this.subscriptionService.updatePlan(userId, planId, body);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getPlans(_: RequestAuth, res: Response) {
    const { message, payload } = await this.subscriptionService.getPlans();
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getPlan(req: RequestAuth, res: Response) {
    const planId = req.params.planId as string;
    const { message, payload } = await this.subscriptionService.getPlan(planId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async deletePlan(req: RequestAuth, res: Response) {
    const planId = req.params.planId as string;
    const userId = req.user?.id as string;
    const { message, payload } = await this.subscriptionService.deletePlan(userId, planId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async createSubscription(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const body = req.body as CreateSubscriptionDto;
    const { message, payload } = await this.subscriptionService.createSubscription(userId, body);
    return res.status(STATUS.created).json({ success: true, message, data: payload });
  }

  async cancelSubscription(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const subscriptionId = req.params.subscriptionId as string;
    const { message, payload } = await this.subscriptionService.cancelSubscription(userId, subscriptionId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getSubscription(req: RequestAuth, res: Response) {
    const subscriptionId = req.params.subscriptionId as string;
    const { message, payload } = await this.subscriptionService.getSubscription(subscriptionId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getSubscriptionsByCustomer(req: RequestAuth, res: Response) {
    const customerId = req.params.customerId as string;
    const { message, payload } = await this.subscriptionService.getSubscriptionsByCustomer(customerId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }
}
