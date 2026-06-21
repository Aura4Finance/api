import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { RefundRepository } from "@/repositories/refund.repository";
import { CustomerRepository } from "@/repositories/customer.repository";
import { WalletService } from "@/services/wallet.service";
import { PayoutService } from "@/services/payout.service";
import { APIError } from "@/utils/error-handler";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { PaymentRepository } from "@/repositories/payment.repository";
import { Mode, TransactionStatus, TransactionType, Wallet } from "@/generated/prisma/client";
import { logTransactionError } from "@/utils/log-transaction-error";


@Service()
export class RefundServices {
    constructor(
        private readonly refundRepository: RefundRepository,
        private readonly walletService: WalletService,
        private readonly paymentRepository: PaymentRepository,
        private readonly payoutService: PayoutService,
        private readonly customerRepository: CustomerRepository,
    ) { }

    private async finalizeRefund(
        wallet: Wallet,
        amount: number,
        amountInUSDC: number,
        reciever: string,
        refundTxId: string,
        paymentTxId: string,
        mode: Mode
    ) {

        const derivedWalletBuffer = await deriveWallet(<number>wallet?.derivationIndex);
        const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
        const primaryCoinObjectId = await this.payoutService.getPrimaryCoin(<Wallet>wallet, mode);

        const amountAfterOnePercentChargeDeduction = amountInUSDC - ( 0.01 * amountInUSDC);
        const result = await this.walletService.splitAndSend(
            secretKey,
            primaryCoinObjectId,
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


        await this.refundRepository.confirmRefund(refundTxId, result?.Transaction.digest);
        const refundedPayment = await this.paymentRepository.refundPayment(paymentTxId);
        await this.customerRepository.updateAmountSpent(<string>refundedPayment?.customer?.id, amountInUSDC, "remove");
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
        const refundTransaction = await this.refundRepository.getRefundById(txId, profileId);
        if (
            !refundTransaction ||
            refundTransaction.confirmedAt ||
            refundTransaction.status !== TransactionStatus.FAILED ||
            refundTransaction.type !== TransactionType.REFUND) {
            throw new APIError("Refund transaction is not eligible for retry.", STATUS.bad);
        }
        const paymentTx = await this.paymentRepository.findPaymentById(<string>refundTransaction.refund?.originalTxId, profileId);
        if (paymentTx?.payment?.refunded) {
            throw new APIError("Payment has already been refunded.", STATUS.bad);
        }
        return await this.finalizeRefund(
            wallet,
            refundTransaction.amount,
            <number>paymentTx?.amountInUSDC,
            <string>refundTransaction.refund?.walletAddress,
            refundTransaction.id,
            <string>paymentTx?.id,
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
        const paymentTx = await this.paymentRepository.findPaymentById(txId, profileId);
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
            paymentTx?.customerId as string,
            profileId,
            mode
        );
        return await this.finalizeRefund(
            wallet,
            paymentTx.amount,
            <number>paymentTx?.amountInUSDC,
            to,
            refundTx.id,
            paymentTx.id,
            mode
        );
    }
}
