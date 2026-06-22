import express, { Request, Response } from "express";
import { Container } from "typedi";
import { AdminController } from "@/controllers/admin.controller";
import { asyncHandler } from "@/utils/error-handler";
import "reflect-metadata";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { checkUserRole, verifyAccessToken } from "@/middlewares/user.milddleware";
import { RequestAuth } from "@/@types/request";

const router = express.Router();
const adminController = Container.get(AdminController);

router.post(
  "/auth/change-password",
  verifyRequestBody,
  asyncHandler((req: Request, res: Response) =>
    adminController.changePassword(req, res)
  )
);

router.post(
  "/auth/login",
  verifyRequestBody,
  asyncHandler((req: Request, res: Response) =>
    adminController.signin(req, res)
  )
);


router.post(
  "/auth/resend-otp",
  verifyRequestBody,
  asyncHandler((req: Request, res: Response) =>
    adminController.resendOtp(req, res)
  )
);

router.post(
  "/auth/forgot-password",
  verifyRequestBody,
  asyncHandler((req: Request, res: Response) =>
    adminController.forgotPassword(req, res)
  )
);

router.post(
  "/auth/reset-password",
  verifyRequestBody,
  asyncHandler((req: Request, res: Response) =>
    adminController.resetPassword(req, res)
  )
);

router.use(
  verifyAccessToken, 
  checkUserRole("ADMIN")
);

router.post(
  "auth/logout",
  asyncHandler((req: RequestAuth, res: Response) => 
  adminController.signout(req, res)
)
)

router.get(
  "/profile",
  asyncHandler((req: RequestAuth, res: Response) => 
  adminController.getProfile(req, res)
)
)

router.get(
  "/merchants",
  asyncHandler((req: RequestAuth, res: Response) =>
    adminController.getMerchants(req, res)
  )
);

router.get(
  "/merchants/:id",
  asyncHandler((req: RequestAuth, res: Response) =>
    adminController.getMerchant(req, res)
  )
);

router.patch(
  "/merchants/:id/disable",
  asyncHandler((req: RequestAuth, res: Response) =>
    adminController.disableMerchant(req, res)
  )
);

router.patch(
  "/merchants/:id/enable",
  asyncHandler((req: RequestAuth, res: Response) =>
    adminController.enableMerchant(req, res)
  )
);


router.get(
  "/transactions",
  asyncHandler((req: Request, res: Response) => 
    adminController.getAllTransactions(req, res)
)
)
router.get(
  "/transactions/overview",
  asyncHandler((req: Request, res: Response) => 
    adminController.getTransactionOverview(req, res)
)
)
router.get(
  "/transactions/:txId",
  asyncHandler((req: Request, res: Response) => 
    adminController.getTransactionById(req, res)
)
)


router.get(
  "/customers",
  asyncHandler((req: Request, res: Response) => 
    adminController.getAllCustomers(req, res)
)
)
router.get(
  "/customers/:customerId",
  asyncHandler((req: Request, res: Response) => 
    adminController.getCustomerById(req, res)
)
)

router.get(
  "/metrics/transactions",
  asyncHandler((req: Request, res: Response) => 
    adminController.getTransactionMetrics(req, res)
)
)

router.get(
  "/metrics/merchants",
  asyncHandler((req: Request, res: Response) => 
    adminController.getMerchantMetrics(req, res)
)
)

router.get(
  "/metrics/revenue",
  asyncHandler((req: Request, res: Response) => 
    adminController.getPlatformRevenueMetrics(req, res)
)
)

router.get(
  "/metrics/health",
  asyncHandler((req: Request, res: Response) =>
    adminController.healthCheck(req, res)
  )

);  

router.get(
  "/metrics/dashboard",
  asyncHandler((req: Request, res: Response) =>
  adminController.getDashboardMetrics(req, res))
);
// router.get(
//   "/merchants/:id/api-keys",
//   asyncHandler((req: RequestAuth, res: Response) =>
//     adminController.getMerchantApiKeys(req, res)
//   )
// );

// router.get(
//   "/api-keys/:keyId",
//   asyncHandler((req: RequestAuth, res: Response) =>
//     adminController.getKeyDetails(req, res)
//   )
// );

// router.patch(
//   "/api-keys/:keyId/disable",
//   asyncHandler((req: RequestAuth, res: Response) =>
//     adminController.disableApiKey(req, res)
//   )
// );

// router.patch(
//   "/api-keys/:keyId/enable",
//   asyncHandler((req: RequestAuth, res: Response) =>
//     adminController.disableApiKey(req, res)
//   )
// );

// router.delete(
//   "/api-keys/:keyId/delete",
//   asyncHandler((req: RequestAuth, res: Response) =>
//     adminController.deleteApiKey(req, res)
//   )
// );


router.post(
  "/create",
  asyncHandler((req: RequestAuth, res: Response) =>
    adminController.create(req, res)
  )
);

export default router;

