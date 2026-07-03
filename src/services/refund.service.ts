import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { RefundRepository } from "@/repositories/refund.repository";
import { WalletService } from "@/services/wallet.service";
import { APIError } from "@/utils/error-handler";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { PaymentRepository } from "@/repositories/payment.repository";
import { Mode, TransactionStatus, TransactionType, Wallet } from "@/generated/prisma/client";
import { logTransactionError } from "@/utils/log-transaction-error";
import { CustomerRepository } from "@/repositories/customer.repository";


@Service()
export class RefundServices {
    constructor(
        private readonly refundRepository: RefundRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly walletService: WalletService,
        private readonly paymentRepository: PaymentRepository,
    ) { }

    private async finalizeRefund(
        wallet: Wallet,
        amount: number,
        amountInUSDC: number,
        reciever: string,
        refundTxId: string,
        paymentTxId: string,
        profileId: string,
        customerId: string,
        mode: Mode
    ) {

        const derivedWalletBuffer = await deriveWallet(wallet?.derivationIndex!);
        const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);

        const amountAfterOnePercentChargeDeduction = amountInUSDC - ( 0.01 * amountInUSDC);
        const result = await this.walletService.splitAndSend(
            secretKey,
            amountAfterOnePercentChargeDeduction,
            reciever,
            mode
        );

        if (result.$kind !== "Transaction") {
            const errorMessage = result.FailedTransaction.effects?.status?.error?.message;
            logTransactionError(result);
            await this.refundRepository.failRefund(
                refundTxId,
                result.FailedTransaction.digest
            );
            if (errorMessage?.includes("InsufficientCoinBalance")) {
                throw new APIError(
                    "Refund failed due to insufficient balance.",
                    STATUS.conflict
                );
            }
            throw new APIError(
                "Refund failed due to an on-chain error.",
                STATUS.bad
            );
        }


        await this.refundRepository.confirmRefund(refundTxId, paymentTxId, result?.Transaction.digest);
        await this.customerRepository.updateAmountSpent(
            customerId,
            profileId,
            amountInUSDC,
            mode,
            "remove"
        );
        const gasUsed = result.Transaction?.effects?.gasUsed;
        const totalGas = Number(BigInt(Number(gasUsed?.computationCost)) + BigInt(Number(gasUsed?.storageCost)) - BigInt(Number(gasUsed?.storageRebate))) * 0.000000001;

        return {
            message: "Refund Payout initiated successfully",
            payload: {
                status: "COMPLETED",
                amount: amount,
                txDigest: result.Transaction.digest,
                executionTime: result.Transaction?.epoch,
                gasFee: totalGas,
                platformFee: null,
                amountSent: amount,
            },
        };
    }

    async retryRefund(
        txId: string,
        wallet: Wallet,
        profileId: string,
        mode: Mode
    ) {
        const tx = await this.refundRepository.getRefundById(txId, profileId);
        if (
            !tx ||
            tx.confirmedAt ||
            tx.status !== TransactionStatus.FAILED ||
            tx.type !== TransactionType.REFUND) {
            throw new APIError("Refund transaction is not eligible for retry.", STATUS.bad);
        }

        return await this.finalizeRefund(
            wallet,
            tx.amount,
            tx.amountInUSDC,
            tx.refund?.walletAddress!,
            tx.id,
            tx.refund?.originalTxId!,
            tx.customerId!,
            tx.profileId!,
            mode
        );
    }

    async initiateRefund(
        to: string,
        reason: string,
        txId: string,
        wallet: Wallet,
        profileId: string,
        mode: Mode
    ) {
        const paymentTx = await this.paymentRepository.findPaymentById(txId, mode, profileId);
        if (!paymentTx) {
            throw new APIError("Original transaction not found.", STATUS.notFound);
        }
        if (paymentTx.status !== "COMPLETED") {
            throw new APIError("Only completed transactions can be refunded.", STATUS.bad);
        }
        if (paymentTx.type != "PAYMENT") {
            throw new APIError("Transaction id is invalid for refunds.", STATUS.bad);
        }
        if (paymentTx.payment?.refunded) {
            throw new APIError("Payment has already been refunded.", STATUS.bad);
        }

        const refundTx = await this.refundRepository.createRefund(
            paymentTx.amount,
            paymentTx.amountInUSDC,
            paymentTx.network,
            paymentTx.currency,
            reason,
            paymentTx.id,
            to,
            paymentTx?.customerId!,
            profileId,
            mode
        );
        return await this.finalizeRefund(
            wallet,
            paymentTx.amount,
            paymentTx?.amountInUSDC!,
            to,
            refundTx.id,
            paymentTx.id,
            paymentTx.customerId!,
            paymentTx.profileId!,
            mode
        );
    }
}
