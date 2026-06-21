import { Network } from "@/generated/prisma/client";

export interface AddSettlementAccountDto {
  walletAddress: string;
  alias: string;
  network: Network;
}
