import { RequestAuth } from "@/@types/request";
import { Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { FiatService } from "@/services/user/fiat.service";
import { Service } from "typedi";
import { 
    addBankAccountSchemaValidation,
    updateAccountSchemaValidation
 } from "@/validation/fiat.validation";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { 
    CreateAccountDto,
    UpdateAccountDto
 } from "@/dto/fiat.dto";

@Service()
export class FiatController {
    constructor(
        private readonly fiatService: FiatService
    ){}



    async getBanks(_: Request, res: Response){
        const banks = await this.fiatService.getBanks();

        res.status(STATUS.ok).json({
            success: true,
            message: "Banks retrived sucessfully!",
            data: {
                banks
            }
        })
    }

    async getRates(_: Request, res: Response){
        const rates = await this.fiatService.getRates();
        return res.status(STATUS.ok).json({
            success: true,
            message: "Rates retrieved successfully!",
            data: {
                rates
            }
        })
    }

    async addBankAccount(req: RequestAuth, res: Response){
        const { error, value } = addBankAccountSchemaValidation(req.body);
        if(error){
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
                data: null
            })
        }
        const body: CreateAccountDto = value;
        const revolvedAccount = await this.fiatService.addBankAccount(
            body.accountNumber, 
            body.bankCode, 
            body.bankName, 
            body.isPrimary,
            req.user.id
        );
        return res.status(STATUS.created).json({
            success: true,
            message: "Fiat account validated and added successfully!",
            data: {
                revolvedAccount
            }
        })
    }

    async getAllAccounts(req: RequestAuth, res: Response){
        const profileId = req.user?.id as string;
        console.log(profileId)
        const accounts = await this.fiatService.getAllAccounts(profileId);
        return res.status(STATUS.ok).json({
            status: true,
            message: "Fiat accounts retrieved successfully!",
            data: {
                accounts
            }
        })
    }

    async deleteAccount(req: RequestAuth, res: Response){
        const { id } = req.params;
        await this.fiatService.deleteAccount(id as string, req.user.id);
        return res.status(STATUS.ok).json({
            status: true,
            message: "Fiat account deleted successfully!",
            data: null
        })
    }

    async updateAccount(req: RequestAuth, res: Response){
        const { id } = req.params;
        const { error, value } = updateAccountSchemaValidation(req.body);

        if(error){
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error)
            })
        }
        const body: UpdateAccountDto = value;
        await this.fiatService.updateAccount(id as string, req.user.id, body.isPrimary);
        return res.status(STATUS.ok).json({
            status: true,
            message: "Fiat account updated successfully!",
            data: null
        })
    }
}
