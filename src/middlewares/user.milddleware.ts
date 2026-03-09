import { NextFunction, Request, Response, RequestHandler } from "express";
import { APIError } from "../utils/error-handler";
import { STATUS } from "../constants/status.constant";
import jwt from "jsonwebtoken";
import Container from "typedi";
import { UserRepository } from "@/repositories/user/user.repository";
import { RequestAuth } from "@/@types/request";
import { ApiKeyService } from "@/services/user/api-key.service";
import speakeasy from "speakeasy";
import logger from "@/utils/logger";
import { PaymentMethod, Role } from "../../generated/prisma";
import { PaylinkRepository } from "@/repositories/paylink.repository";
import { redisClient } from "./rate-limit.middleware";



const userRepository = Container.get(UserRepository);
export const verifyAccessToken = async (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const token = req.cookies?.access_token;
  if (!token) {
    throw new APIError("Access token missing", STATUS.unauthorized);
  }
  try {
    // console.log(token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      email: string;
      jti: string;
    };

    const isBlacklisted = await redisClient.exists(`bl:${decoded.jti}`);

    if (isBlacklisted) {
      throw new APIError("Access token revoked", STATUS.unauthorized);
    }
    const user = await userRepository.findUserByEmail(decoded.email);
    if (!user) {
      throw new APIError("User not authorized", STATUS.unauthorized);
    }

    if (user.disabled) {
      throw new APIError("User not authorized", STATUS.unauthorized);
    }

    (req as any).user = user;
    (req as any).jti = decoded.jti;
    (req as any).exp = (decoded as any).exp;
    next();
  } catch (err) {
    throw new APIError("Invalid access token", STATUS.unauthorized);
  }
};

export const checkUserRole =
  (role: Role): RequestHandler =>
    (req: Request, _: Response, next: NextFunction) => {
      const request = req as RequestAuth;
      if (!request.user) {
        throw new APIError("User not found", STATUS.notFound);
      }
      if (request.user.role !== role) {
        throw new APIError("Forbidden: Access Denied", STATUS.forbidden);
      }
      next();
    };

export const checkIfUserIsDisabled: RequestHandler = (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const request = req as RequestAuth;
  if (!request.user) {
    throw new APIError("User not found", STATUS.notFound);
  }

  if (request.user.disabled) {
    throw new APIError("User account is disabled!", STATUS.forbidden);
  }
  next();
};

export const verifyApiKey = async (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const publicRoutes = [
    { method: "GET", path: /^\/paylink\/[^/]+$/ }, // GET /paylink/:id
  ];

  const isPublic = publicRoutes.some(route =>
    route.method === req.method && route.path.test(req.path)
  );

  if (isPublic) {
    return next();
  }
  const apiKeyService = Container.get(ApiKeyService);
  const userRepository = Container.get(UserRepository);
  const apiKeyHeader = Array.isArray(req.headers["x-api-key"])
    ? req.headers["x-api-key"][0]
    : req.headers["x-api-key"];

  if (!apiKeyHeader) {
    logger.warn(`API key missing from ${req.ip}`);
    throw new APIError("API key missing", STATUS.unauthorized);
  }

  const apiKey = await apiKeyService.validateApiKey(apiKeyHeader);
  if (!apiKey) {
    logger?.warn(`Invalid API key attempt from ${req.ip}`);
    throw new APIError("Invalid API key", STATUS.unauthorized);
  }
  if (!apiKey.profile.onboarded && apiKey.mode === "live") {
    throw new APIError("Live Api key cannot be used until merchant is onboarded!", STATUS.bad);
  }
  const user = await userRepository.findUserById(apiKey.profile.userId);
  if (!user) {
    logger?.warn(`User associated with API key not found from ${req.ip}`);
    throw new APIError("User not found", STATUS.notFound);
  }
  (req as any).user = user;
  (req as any).mode = apiKey.mode;
  (req as any).type = PaymentMethod.HOSTED_CHECKOUT
  next();
};

export const verifyPaylink = async (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const paylinkId = req.headers["payment-link-id"];
  const paylinkRepository = Container.get(PaylinkRepository);

  if (!paylinkId) {
    logger?.warn("Missing header for paylink");
    throw new APIError("Missing header for paylink", STATUS.unauthorized);
  }
  if (!(typeof paylinkId === "string")) {
    throw new APIError("Invalid paylink ID format", STATUS.unauthorized);
  }
  const paylink = await paylinkRepository.getPaylink(paylinkId);
  if (!paylink) {
    logger?.warn("Payment Link not found");
    throw new APIError("Payment Link not found!", STATUS.notFound);
  }

  const profile = await userRepository.findUserById(paylink.profile.userId);
  if (!profile) return;
  (req as any).user = profile;
  (req as any).mode = paylink.mode;
  (req as any).payLink = paylink;
  (req as any).type = PaymentMethod.PAYMENT_LINK;
  next();
}

export const verifyActionUsing2FA: RequestHandler =  async (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const request = req as RequestAuth;
  // Only enforce 2FA for high-risk POST actions:
  // 1. API key creation/regeneration (POST /api-keys, /api-keys/regenerate)
  // 2. Initiating a payout (POST /transactions/payout/crypto, /transactions/payout/crypto/retry)
  // 3. Initiating a refund (POST /transactions/refund, /transactions/refund/retry)
  if (request.method !== "POST") {
    return next();
  }

  const token = Array.isArray(request.headers["2-fa-key"])
    ? request.headers["2-fa-key"][0]
    : request.headers["2-fa-key"];
  if(!token){
    throw new APIError("2FA token not found!", STATUS.bad);
  }
  const userId = request.user?.id;
  const user = await userRepository.findUserById(<string>userId);

  if(!user?.twoFactorSecret && !user?.twoFactorEnabled){
    throw new APIError("2FA not enabled for this user!", STATUS.bad);
   }
  const verified = speakeasy.totp.verify({
    secret: user?.twoFactorSecret,
    encoding: "base32",
    token,
    window: 1
  });
  if (!verified) {
    throw new APIError("Invalid 2FA token", STATUS.bad);
  }
  next();
}
