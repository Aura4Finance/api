import { Service } from "typedi";
import { STATUS } from "@/constants/status.constant";
import { RefundRepository } from "@/repositories/refund.repository";
import { CustomerRepository } from "@/repositories/customer.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { WalletService } from "@/services/wallet.service";
import { PayoutService } from "@/services/payout.service";
import { APIError } from "@/utils/error-handler";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { PaymentRepository } from "@/repositories/payment.repository";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Mode, TransactionStatus, TransactionType } from "../../generated/prisma";


@Service()
export class RefundServices {
    private client: any;
    private profile: any;
    constructor(
        private readonly refundRepository: RefundRepository,
        private readonly walletService: WalletService,
        private readonly paymentRepository: PaymentRepository,
        private readonly payoutService: PayoutService,
        private readonly userRepository: UserRepository,
        private readonly customerRepository: CustomerRepository,
    ) { }
    private async setActiveNetwork(mode: Mode) {
        this.client = new SuiClient({ url: getFullnodeUrl(`${mode == "live" ? "mainnet" : "testnet"}`) })
    }

    private async finalizeRefund(
        amount: number,
        amountInUSDC: number,
        reciever: string,
        refundTxId: string,
        paymentTxId: string
    ) {
        const wallet = (await this.userRepository.findUserById(this.profile.userId))?.businessProfile?.wallet[0];
        const derivedWalletBuffer = await deriveWallet(<number>wallet?.derivationIndex);
        const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
        let result;
        try {
            const primaryCoinObjectId = await this.payoutService.getPrimaryCoin(wallet, this.client);
            result = await this.walletService.splitAndSend(
                secretKey,
                primaryCoinObjectId,
                amountInUSDC,
                reciever,
                this.client
            )
        } catch (error: any) {
            console.error("Refund processing error:", error);
            this.refundRepository.failRefund(refundTxId, result?.digest as string);
            throw new APIError(`Unable to process refund: ${error.message}`, STATUS.serverUnavailable);
        }

        const status = result.effects?.status?.status;
        const chainError = result.effects?.status?.error;
        if (status !== "success") {
            await this.refundRepository.failRefund(
                refundTxId,
                result.digest
            );

            if (chainError?.includes("InsufficientCoinBalance")) {
                throw new APIError(
                    "Refund failed: insufficient balance",
                    STATUS.conflict
                );
            }

            throw new APIError(
                "Refund failed: on-chain execution error",
                STATUS.bad
            );
        }


        await this.refundRepository.confirmRefund(refundTxId, result?.digest as string);
        const refundedPayment = await this.paymentRepository.refundPayment(paymentTxId);
        await this.customerRepository.updateAmountSpent(<string>refundedPayment?.customer?.id, amount, "remove");
        const gasUsed = result.effects?.gasUsed;
        const totalGas = Number(BigInt(Number(gasUsed?.computationCost)) + BigInt(Number(gasUsed?.storageCost)) - BigInt(Number(gasUsed?.storageRebate))) * 0.000000001;

        return {
            message: "Refund Payout initiated successfully",
            payload: {
                status: "COMPLETED",
                amount: amount,
                txDigest: result.digest,
                executionTime: result.effects?.executedEpoch,
                gasFee: totalGas,
                platformFee: null,
                amountSent: amount,
            },
        };
    }

    async retryRefund(
        txId: string,
        userId: string,
        mode: Mode
    ) {
        const refundTransaction = await this.refundRepository.getRefundById(txId, userId);
        if (
            !refundTransaction ||
            refundTransaction.confirmedAt ||
            refundTransaction.status !== TransactionStatus.FAILED ||
            refundTransaction.type !== TransactionType.REFUND) {
            throw new APIError("Invalid refund transaction ID", STATUS.bad);
        }
        const paymentTx = await this.paymentRepository.findPaymentById(<string>refundTransaction.refund?.originalTxId, userId);
        if(paymentTx?.payment?.refunded){
            throw new APIError("Payment transaction already refunded", STATUS.bad);
        }
        this.profile = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile);
        await this.setActiveNetwork(mode);
        return await this.finalizeRefund(
            refundTransaction.amount, 
            <number>paymentTx?.amountInUSDC, 
            <string>refundTransaction.refund?.walletAddress, 
            refundTransaction.id,
            <string>paymentTx?.id
        );
    }

    async initiateRefund(
        to: string,
        reason: string,
        txId: string,
        userId: string,
        mode: Mode
    ) {
        const paymentTx = await this.paymentRepository.findPaymentById(txId, userId);
        if (!paymentTx) {
            throw new APIError("Original transaction not found", STATUS.notFound);
        }
        if (paymentTx.status !== "COMPLETED") {
            throw new APIError("Only completed transactions can be refunded", STATUS.bad);
        }
        if (paymentTx.type != "PAYMENT") {
            throw new APIError("Invalid transaction ID", STATUS.bad);
        }
        if(paymentTx.payment?.refunded){
            throw new APIError("Payment transaction already refunded.", STATUS.bad);
        }

        this.profile = await this.userRepository
            .findUserById(userId)
            .then((user) => user?.businessProfile);

        await this.setActiveNetwork(mode);
        const refundTx = await this.refundRepository.createRefund(
            paymentTx.amount,
            paymentTx.amountInUSDC,
            paymentTx.network,
            paymentTx.currency,
            reason,
            paymentTx.id,
            to,
            paymentTx?.customerId as string,
            this.profile.id,
            this.profile.isLive ? "live" : "test"
        );
        return await this.finalizeRefund(
            paymentTx.amount, 
            <number>paymentTx?.amountInUSDC, 
            to, 
            refundTx.id,
            paymentTx.id
        );
    }
}
