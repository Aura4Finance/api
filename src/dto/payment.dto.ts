import { Network, Paylink, PaymentMethod } from "../../generated/prisma";

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

export interface VerifyPaymentDto {
  paymentId: string;
}

export interface RetrievePaymentInformationDto {
  paymentId: string
}
