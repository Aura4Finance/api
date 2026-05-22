import { STATUS } from "@/constants/status.constant";
import { AddSettlementAccountDto } from "@/dto/settlement.dto";
import { SettlementRepository } from "@/repositories/user/settlement.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import { isValidSuiAddress } from "@mysten/sui/utils";

@Service()
export class SettlementService {
  constructor(
    private readonly settlementRepository: SettlementRepository
  ) {}

  async addSettlementAccount(profileId: string, body: AddSettlementAccountDto) {

    if(!isValidSuiAddress(body.walletAddress)){
      throw new APIError("Wallet address is invalid.", STATUS.bad);
    }
    const existingAccount = await this.settlementRepository.findSettlemtAccountByAddress(
        body.walletAddress,
        body.network,
        profileId
      );

    if (existingAccount) {
      throw new APIError("Wallet address already exists.", STATUS.conflict);
    }

    await this.settlementRepository.addSettlementAccount(
      body.walletAddress,
      body.network,
      body.alias,
      profileId
    );

    return {
      message: "Settlement account added successfully",
      payload: null,
    };
  }

  async getAllSettlementAccount(profileId: string) {
    const accounts = await this.settlementRepository.getAllSettlementAccounts(profileId);

    return {
      message: "Settlement accounts retrieved successfully",
      payload: accounts,
    };
  }

  async deleteSettlementAccount(profileId: string, accountId: string) {
    const account = await this.settlementRepository.findSettlementAccountById(
      accountId,
      profileId
    );

    if (!account) {
      throw new APIError("Settlement account not found.", STATUS.notFound);
    }

    await this.settlementRepository.deleteSettlementAccount(accountId, profileId);

    return {
      message: "Account deleted successfully",
      payload: null,
    };
  }
}
