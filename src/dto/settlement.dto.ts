import { Network } from "@generated/prisma";

export interface AddSettlementAccountDto {
  walletAddress: string;
  alias: string;
  network: Network;
}
