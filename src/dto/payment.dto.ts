import { Network, Paylink, PaymentMethod, Token } from "../../generated/prisma";

export interface CreatePaymentDto {
  amount: number;
  customer?: {
    fullname: string;
    email: string;
  };
  customerId?: string,
  currency: string,
  network: Network,
  txRef: string;
  type: PaymentMethod,
  redirectUrl?: string,
  payLink?: Paylink
}

export type VerifyPaymentDto  = {
  paymentId: string;
  token: Token
}

export interface RetrievePaymentInformationDto {
  paymentId: string
}
