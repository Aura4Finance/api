import { Request } from "express";
import { Paylink, PaymentMethod } from "../../generated/prisma";
export interface RequestAuth extends Request {
  user: {
    id: string,
    email: string,
    role: "ADMIN" | "MERCHANT",
    disabled: boolean,
    businessProfile: {
      id: string,
      isLive: boolean;
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
