import { RequestAuth } from "@/@types/request";
import { Request, Response } from "express";
import { STATUS } from "@/constants/status.constant";
import { FiatService } from "@/services/user/fiat.service";
import { Service } from "typedi";
import {
    addBankAccountSchemaValidation,
    deleteAccountSchemaValidation,
    resolveAccountSchemaValidation,
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
    ) { }

    async getBanks(_: Request, res: Response) {
        const { payload, message } = await this.fiatService.getBanks();

        res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload
        })
    }

    async getRates(req: Request, res: Response) {
        if (!(typeof req.query.currency === "string")) {
            return res.status(STATUS.bad).json({
                success: false,
                message: "Currency query parameter must be a string.",
                data: null
            })
        }
        const { payload, message } = await this.fiatService.getRates(req.query.currency || "NGN");
        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload
        })
    }

    async resolveAccount(req: Request, res: Response) {
        const { error, value } = resolveAccountSchemaValidation(req.query as any);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
                data: null
            })
        }
        const { accountNumber, bankCode } = value;
        const { payload, message } = await this.fiatService.resolveAccountName(accountNumber, bankCode);
        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload
        })
    }

    async addBankAccount(req: RequestAuth, res: Response) {
        const { error, value } = addBankAccountSchemaValidation(req.body);
        if (error) {
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

    async getAllAccounts(req: RequestAuth, res: Response) {
        const userId = req.user?.id as string;
        const { payload, message } = await this.fiatService.getAllAccounts(userId);
        return res.status(STATUS.ok).json({
            status: true,
            message,
            data: payload
        })
    }

    async deleteAccount(req: RequestAuth, res: Response) {
        const { error, value } = deleteAccountSchemaValidation(req.params as any);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
                data: null
            })
        }
        const { id } = value;
        await this.fiatService.deleteAccount(id, req.user.id);
        return res.status(STATUS.ok).json({
            status: true,
            message: "Fiat account deleted successfully!",
            data: null
        })
    }

    async updateAccount(req: RequestAuth, res: Response) {
        const { id } = req.params;
        const { error, value } = updateAccountSchemaValidation(req.body);

        if (error) {
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
