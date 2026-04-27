import { STATUS } from "@/constants/status.constant";
import { AddSettlementAccountDto } from "@/dto/settlement.dto";
import { SettlementRepository } from "@/repositories/user/settlement.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import { isValidSuiAddress } from "@mysten/sui/utils";

@Service()
export class SettlementService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly settlementRepository: SettlementRepository
  ) {}

  async addSettlementAccount(userId: string, body: AddSettlementAccountDto) {

    if(!isValidSuiAddress(body.walletAddress)){
      throw new APIError("Wallet address is invalid.", STATUS.bad);
    }
    const user = await this.userRepository.findUserById(userId);
    const existingAccount = await this.settlementRepository.findSettlemtAccountByAddress(
        body.walletAddress,
        body.network,
        <string>user?.businessProfile?.id
      );

    if (existingAccount) {
      throw new APIError("Wallet address already exists.", STATUS.conflict);
    }

    await this.settlementRepository.addSettlementAccount(
      body.walletAddress,
      body.network,
      body.alias,
      <string>user?.businessProfile?.id
    );

    return {
      message: "Settlement account added successfully",
      payload: null,
    };
  }

  async getAllSettlementAccount(userId: string) {
    const user = await this.userRepository.findUserById(userId);

    if (!user) {
      throw new APIError("User account not found.", STATUS.notFound);
    }

    const accounts = await this.settlementRepository.getAllSettlementAccounts(
      <string>user.businessProfile?.id
    );

    return {
      message: "Settlement accounts retrieved successfully",
      payload: accounts,
    };
  }

  async deleteSettlementAccount(userId: string, accountId: string) {
    const user = await this.userRepository.findUserById(userId);

    if (!user) {
      throw new APIError("User account not found.", STATUS.notFound);
    }

    const account = await this.settlementRepository.findSettlemtAccountById(
      accountId,
      <string>user.businessProfile?.id
    );

    if (!account) {
      throw new APIError("Settlement account not found.", STATUS.notFound);
    }

    await this.settlementRepository.deleteSettlementAccount(accountId);

    return {
      message: "Account deleted successfully",
      payload: null,
    };
  }
}
