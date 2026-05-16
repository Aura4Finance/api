import express from "express";

import onboardingRoutes from "./user/onboarding.routes";
import profileRoutes from "./user/profile.routes";
import settlementRoutes from "./user/settlement.routes";
import apiKeyRoutes from "./user/api-key.routes";
import modeRoutes from "./user/mode.routes";
import webhookRoutes from "./user/webhook.routes";
import securityRoutes from "./user/security.routes";
import fiatRoutes from "./user/fiat.routes";
import transactionRoutes from "./user/transaction.routes";
import paylinkRoutes from "./paylink.routes";
import subscriptionRoutes from "./subscription.routes";
import customersRoutes from "./customer.routes";
import paymentRoutes from "./payment.routes";
import notificationRoutes from "./user/notification.routes"
import extraRoutes from "./extras/routes";

import { 
    checkUserRole, 
    verifyAccessToken, 
    verifyActionUsing2FA, 
    verifyApiKey 
} from "@/middlewares/user.milddleware";

const dashboardRouter = express.Router();

dashboardRouter.use(verifyAccessToken);
dashboardRouter.use(checkUserRole("MERCHANT"));
dashboardRouter.use("/onboarding", onboardingRoutes);
dashboardRouter.use("/transactions", verifyActionUsing2FA, transactionRoutes);
dashboardRouter.use("/profile", profileRoutes);
dashboardRouter.use("/settlements/crypto", settlementRoutes);
dashboardRouter.use("/settlements/fiat", fiatRoutes);
dashboardRouter.use("/api-keys", verifyActionUsing2FA, apiKeyRoutes);
dashboardRouter.use("/business/mode", modeRoutes);
dashboardRouter.use("/webhook", webhookRoutes);
dashboardRouter.use("/security", securityRoutes);
dashboardRouter.use("/paylinks", paylinkRoutes); //4
dashboardRouter.use("/customers", customersRoutes);
dashboardRouter.use("/notification", notificationRoutes);
dashboardRouter.use("/subscriptions", subscriptionRoutes);

const apiRouter = express.Router();
apiRouter.use("/user", dashboardRouter);
apiRouter.use("/transactions/payment", paymentRoutes);
apiRouter.use("/", extraRoutes);
apiRouter.use(verifyApiKey);
apiRouter.use("/paylinks", paylinkRoutes); //3
apiRouter.use("/webhook", webhookRoutes);
apiRouter.use("/business/mode", modeRoutes);
apiRouter.use("/transactions", transactionRoutes);
apiRouter.use("/profile", profileRoutes);
apiRouter.use("/settlements/crypto", settlementRoutes);  //1
apiRouter.use("/settlements/fiat", fiatRoutes); //2
apiRouter.use("/customers", customersRoutes);
apiRouter.use("/notification", notificationRoutes);
apiRouter.use("/subscriptions", subscriptionRoutes);


export default apiRouter;

