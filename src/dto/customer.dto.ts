import { Mode } from "@generated/prisma";

export interface CreateCustomerDto {
  firstname: string;
  lastname: string;
  email: string;
}

export type AmountSpentUSDT =
  | "BELOW10USDT"
  | "FROM10TO30USDT"
  | "FROM30TO100USDT"
  | "FROM100TO200USDT"
  | "FROM200TO500USDT"
  | "ABOVE500USDT";

export interface GetCustomersQueryDto {
  sortOrder?: "asc" | "desc"; 
  userId?: string,
  mode?: Mode,
  amountSpent?: AmountSpentUSDT;
  limit?: number;
  cursor?: string;
}

export interface GetACustomerQueryDto {
  customerId: string
}
