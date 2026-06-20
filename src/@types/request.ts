import { Request } from "express";
import { Paylink, PaymentMethod, Wallet } from "@generated/prisma";
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
