import { Request } from "express";
import { Paylink, Wallet, PaymentMethod } from "@/generated/prisma/client";
export interface RequestAuth extends Request {
  user: {
    id: string,
    email: string,
    role: "ADMIN" | "MERCHANT",
    disabled: boolean,
    businessProfile: {
      onboarded: boolean,
      id: string,
      isLive: boolean;
      wallet: Wallet[]
    }
  }
  userId?: string;
  mode: "live" | "test";
  payLink?: Paylink,
  type?: PaymentMethod,
  jti?: string;
  exp?: number;
  files?: Express.Multer.File[];
}
