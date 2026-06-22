import express from "express";
import onboardingRoutes from "@/routes/user/onboarding.routes";
import profileRoutes from "@/routes/user/profile.routes";
import settlementRoutes from "@/routes/user/settlement.routes";
import apiKeyRoutes from "@/routes/user/api-key.routes";
import modeRoutes from "@/routes/user/mode.routes";
import webhookRoutes from "@/routes/user/webhook.routes";
import securityRoutes from "@/routes/user/security.routes";
import fiatRoutes from "@/routes/user/fiat.routes";
import transactionRoutes from "@/routes/user/transaction.routes";
import paylinkRoutes from "@/routes/paylink.routes";
import subscriptionRoutes from "@/routes/subscription.routes";
import customersRoutes from "@/routes/customer.routes";
import paymentRoutes from "@/routes/payment.routes";
import notificationRoutes from "@/routes/user/notification.routes"
import extraRoutes from "@/routes/extras/routes";

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

