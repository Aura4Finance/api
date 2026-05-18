import { RequestAuth } from "@/@types/request";
import { SubscriptionController } from "@/controllers/subscription.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";
import { checkIfUserIsDisabled } from "@/middlewares/user.milddleware";
import { verifyRequestBody } from "@/middlewares/verify-request-body";

const router = express.Router();
const controller = Container.get(SubscriptionController);

// Plans
router.post("/plans",
    checkIfUserIsDisabled,
    verifyRequestBody,
    asyncHandler((req: RequestAuth, res: Response) =>
        controller.createPlan(req, res)
    ));

router.get("/plans", 
    asyncHandler((req: RequestAuth, res: Response) => 
        controller.getPlans(req, res)
));

router.get("/plans/:planId", 
    asyncHandler((req: RequestAuth, res: Response) => 
    controller.getPlan(req, res)
));

router.patch("/plans/:planId",
    checkIfUserIsDisabled,
    verifyRequestBody,
    asyncHandler((req: RequestAuth, res: Response) =>
        controller.updatePlan(req, res)));
router.delete("/plans/:planId", checkIfUserIsDisabled, asyncHandler((req: RequestAuth, res: Response) => controller.deletePlan(req, res)));

// Subscriptions
router.post("/",
    checkIfUserIsDisabled,
    verifyRequestBody,
    asyncHandler((req: RequestAuth, res: Response) =>
        controller.createSubscription(req, res)
    ));
router.post("/:subscriptionId/cancel", checkIfUserIsDisabled, asyncHandler((req: RequestAuth, res: Response) => controller.cancelSubscription(req, res)));
router.get("/customer/:customerId", asyncHandler((req: RequestAuth, res: Response) => controller.getSubscriptionsByCustomer(req, res)));
router.get("/:subscriptionId", asyncHandler((req: RequestAuth, res: Response) => controller.getSubscription(req, res)));

export default router;
