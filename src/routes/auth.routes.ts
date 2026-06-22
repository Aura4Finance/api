import express, { Request, Response } from "express";
import { Container } from "typedi";
import { AuthController } from "@/controllers/auth.controller";
import { asyncHandler } from "@/utils/error-handler";
import "reflect-metadata";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { RequestAuth } from "@/@types/request";
import { verifyAccessToken } from "@/middlewares/user.milddleware";

const router = express.Router();

const authController = Container.get(AuthController);

router.post(
  "/logout",
  verifyAccessToken,
  asyncHandler((req: RequestAuth, res: Response) => 
    authController.signOut(req, res))
)

router.use(verifyRequestBody);

router.post(  
  "/create-account",
  asyncHandler((req: Request, res: Response) =>
    authController.register(req, res)
  )
);
router.post(
  "/verify-email",
  asyncHandler((req: Request, res: Response) =>
    authController.verifyEmail(req, res)
  )
);
router.post(
  "/resend-otp",
  asyncHandler((req: Request, res: Response) =>
    authController.resendOtp(req, res)
  )
);
router.post(
  "/login",
  asyncHandler((req: Request, res: Response) => 
    authController.signIn(req, res))
);

router.post(
  "/login/2fa",
  asyncHandler((req: Request, res: Response) => 
    authController.continueWith2FA(req, res))
);

router.post(
  "/exchange-code",
  asyncHandler((req: Request, res: Response) => 
    authController.exchangeCode(req, res))
);


router.post(
  "/forgot-password",
  asyncHandler((req: Request, res: Response) =>
    authController.forgotPassword(req, res)
  )
);

router.post(
  "/reset-password",
  asyncHandler((req: Request, res: Response) =>
    authController.resetPassword(req, res)
  )
);

export default router;
