import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { AddSettlementAccountDto } from "@/dto/settlement.dto";
import { SettlementService } from "@/services/user/settlement.service";
import { APIError } from "@/utils/error-handler";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { addSettlementAccountSchemaValidation } from "@/validation/settlement.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  async addSettlementAccount(req: RequestAuth, res: Response) {
    const { error, value } = addSettlementAccountSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: AddSettlementAccountDto = value as AddSettlementAccountDto;
    const profileId = req.user.businessProfile.id;

    const { message, payload } =
      await this.settlementService.addSettlementAccount(profileId, body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getAllSettlementAccounts(req: RequestAuth, res: Response) {
    const profileId = req.user.businessProfile.id;

    const { message, payload } =
      await this.settlementService.getAllSettlementAccount(profileId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async deleteSettlementAccount(req: RequestAuth, res: Response) {
    const profileId = req.user.businessProfile.id;
    const accountId = req.params.id as string;

    if (!accountId || accountId.trim() === "") {
      throw new APIError("Settlement account id is required.", STATUS.bad);
    }

    const { message, payload } =
      await this.settlementService.deleteSettlementAccount(profileId, accountId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
