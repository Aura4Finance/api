import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { SubscriptionService } from "@/services/subscription.service";
import { 
  CreateSubscriptionDto, 
  CreateSubscriptionPlanDto, 
  UpdateSubscriptionPlanDto, 
  GetSubscriptionsDto
 } from "@/dto/subscription.dto";
import { formatErrorValidation } from "@/utils/format-validation-error";
import {
  createSubscriptionPlanValidation,
  updateSubscriptionPlanValidation,
  createSubscriptionValidation,
  subscriptionIdValidation,
  planIdValidation,
  customerIdValidation,
} from "@/validation/subscription.validation";

@Service()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async createPlan(req: RequestAuth, res: Response) {
    const { error, value } = createSubscriptionPlanValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body = value as CreateSubscriptionPlanDto;
    const userId = req.user?.id as string;
    const { message, payload } = await this.subscriptionService.createPlan(userId, body);
    return res.status(STATUS.created).json({ success: true, message, data: payload });
  }

  async updatePlan(req: RequestAuth, res: Response) {
    const { error: planError, value: planValue } = planIdValidation(req.params as any);

    if (planError) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(planError),
      });
    }

    const { error, value } = updateSubscriptionPlanValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const planId = planValue.planId as string;
    const body = value as UpdateSubscriptionPlanDto;
    const userId = req.user?.id as string;
    const { message, payload } = await this.subscriptionService.updatePlan(userId, planId, body);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getPlans(_: RequestAuth, res: Response) {
    const { message, payload } = await this.subscriptionService.getPlans();
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getPlan(req: RequestAuth, res: Response) {
    const { error, value } = planIdValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const planId = value.planId as string;
    const { message, payload } = await this.subscriptionService.getPlan(planId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async deletePlan(req: RequestAuth, res: Response) {
    const { error, value } = planIdValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const planId = value.planId as string;
    const userId = req.user?.id as string;
    const { message, payload } = await this.subscriptionService.deletePlan(userId, planId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async createSubscription(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const { error, value } = createSubscriptionValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body = value as CreateSubscriptionDto;
    const { message, payload } = await this.subscriptionService.createSubscription(userId, body, req.mode);
    return res.status(STATUS.created).json({ success: true, message, data: payload });
  }

  async cancelSubscription(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const { error, value } = subscriptionIdValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const subscriptionId = value.subscriptionId as string;
    const { message, payload } = await this.subscriptionService.cancelSubscription(userId, subscriptionId, req.mode);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getSubscription(req: RequestAuth, res: Response) {
    const { error, value } = subscriptionIdValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const subscriptionId = value.subscriptionId as string;
    const { message, payload } = await this.subscriptionService.getSubscription(req.mode, subscriptionId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }

  async getSubscriptionsByCustomer(req: RequestAuth, res: Response) {
    const { error, value } = customerIdValidation({
      ...req.params,
      ...req.query
    } as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const {customerId, planId} = value as GetSubscriptionsDto;
    const { message, payload } = await this.subscriptionService.getSubscriptionsByCustomer(req.mode, customerId, planId);
    return res.status(STATUS.ok).json({ success: true, message, data: payload });
  }
}
