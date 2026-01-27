import { STATUS } from "@/constants/status.constant";
import { AddSettlementAccountDto } from "@/dto/settlement.dto";
import { SettlementRepository } from "@/repositories/user/settlement.repository";
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import { fromBase64, isValidSuiAddress } from "@mysten/sui/utils";

@Service()
export class SettlementService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly settlementRepository: SettlementRepository
  ) {}

  async addSettlementAccount(userId: string, body: AddSettlementAccountDto) {

    if(!isValidSuiAddress(body.walletAddress)){
      throw new APIError("Invalid SUI wallet address", STATUS.bad);
    }
    const user = await this.userRepository.findUserById(userId);
    let publicKey;
    try{
      publicKey = await verifyPersonalMessageSignature(fromBase64(body.bytes), body.signature);
    } catch(err: any){
      console.log(err)
      throw new APIError(`Error: ${err.message}`, STATUS.bad);
    }

    if(!publicKey.verifyAddress(body.walletAddress)){
      throw new APIError("Invalid message signature", STATUS.bad);
    }

    const existingAccount = await this.settlementRepository.findSettlemtAccountByAddress(
        body.walletAddress,
        <string>user?.businessProfile?.id
      );

    if (existingAccount) {
      throw new APIError("Wallet address already exists", STATUS.conflict);
    }

    await this.settlementRepository.addSettlementAccount(
      body.walletAddress,
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
      throw new APIError("User not found", STATUS.notFound);
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
      throw new APIError("User not found", STATUS.notFound);
    }

    const account = await this.settlementRepository.findSettlemtAccountById(
      accountId,
      <string>user.businessProfile?.id
    );

    if (!account) {
      throw new APIError("Account not found", STATUS.notFound);
    }

    await this.settlementRepository.deleteSettlementAccount(accountId);

    return {
      message: "Account deleted successfully",
      payload: null,
    };
  }
}
