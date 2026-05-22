import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { GetAllTransactionsDto, GetATransactionDto } from "@/dto/transaction.dto";
import { TransactionService } from "@/services/transaction.service";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { transactionIdSchemaValidation, transactionQuerySchemaValidation } from "@/validation/transaction.validation";
import { Service } from "typedi";
import { Response } from "express";

@Service()
export class TransactionController {
    constructor(
        private readonly transactionService: TransactionService
    ) {}

    async getTransactionById(req: RequestAuth, res: Response) {
        const profileId = req.user?.businessProfile.id as string;
        const { error, value } = transactionIdSchemaValidation(req.params as any);

        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const params: GetATransactionDto = value;
        const { message, payload } = await this.transactionService.getTransactionById(params.txId, req.mode, profileId);

        return res.status(STATUS.ok).json({
            success: true,
            message,
            data: payload,
        });
}   

    async getAllTransactions(req: RequestAuth, res: Response) {
        const profileId = req.user?.businessProfile.id as string;
        const {error, value} = transactionQuerySchemaValidation(req.query);

        if (error) {
            return res.status(400).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const query: GetAllTransactionsDto = value;
        const { message, payload } = await this.transactionService.getAllTransactions(query, req.mode, profileId);

        return res.status(200).json({
            success: true,
            message,
            data: payload,
        });
}
}