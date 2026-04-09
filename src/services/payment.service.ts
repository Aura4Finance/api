import { CreatePaymentDto, VerifyPaymentDto } from "@/dto/payment.dto";
import { PaymentRepository } from "@/repositories/payment.repository";
import { Service } from "typedi";
import { WalletService } from "./wallet.service";
import { CustomerRepository } from "@/repositories/customer.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { UserRepository } from "@/repositories/user/user.repository";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Customer, Mode } from "../../generated/prisma";
import { redisClient } from "@/middlewares/rate-limit.middleware";
import { WebhookQueue } from "./schedule.webhook.service";
import { EventType } from "@/dto/webhook.dto";
import { EmailQueue } from "./schedule.email.service";
import { PayoutService } from "./payout.service";
import { transactionQueue } from "@/queues/transaction.queue";
import { deriveWallet } from "@/utils/wallet/derive-wallet";

@Service()
export class PaymentService {
  private client!: SuiClient;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly walletService: WalletService,
    private readonly customerRepository: CustomerRepository,
    private readonly userRepository: UserRepository,
    private readonly webhookQueue: WebhookQueue,
    private readonly emailQueue: EmailQueue,
    private readonly payoutService: PayoutService
  ) { }

  private async setActiveNetwork(mode: Mode) {
    this.client = new SuiClient({ url: getFullnodeUrl(`${mode === "live"? "mainnet": "testnet"}`) });
  }

  async createPayment(data: CreatePaymentDto, userId: string, mode: Mode) {
    const user = await this.userRepository.findUserById(userId);
    await this.setActiveNetwork(mode);
    try {
      const {
        amount,
        customer: customerDetails,
        currency,
        network,
        customerId,
        txRef,
        type,
        redirectUrl,
        payLink
      } = data;

      let customer: Customer;

      if (customerId) {
        const existingCustomer = await this.customerRepository.findCustomerById(customerId);
        if (!existingCustomer) {
          throw new APIError("Customer not found!", STATUS.notFound);
        }
        customer = existingCustomer;
      } else if (customerDetails) {
        const { fullname, email } = customerDetails;
        const [customerFirstname, customerLastname] = fullname.trim().split(" ");

        if (!customerFirstname || !customerLastname) {
          throw new APIError("Invalid customer name format!", STATUS.bad);
        }

        const existingCustomer = await this.customerRepository.findCustomer(email);
        if (!existingCustomer) {
          customer = await this.customerRepository.createCustomer(
            customerFirstname,
            customerLastname,
            email,
            user?.businessProfile?.id as string,
            mode
          );
        } else {
          customer = existingCustomer;
        }
      } else {
        throw new APIError("Customer ID or detail format not found!", STATUS.bad);
      }

      await this.customerRepository.addModeToCustomer(customer.id, mode);
      const amountToPay = await this.walletService.convertBetweenCurrencyAndUSDT(
        ((payLink && type == "PAYMENT_LINK")
          ? payLink.amount
          : amount
        ),
        currency,
        "to_USDT");

      const depositAddress = await this.walletService.generatePaymentWallet(
        user?.businessProfile?.wallet[0]?.address as string,
        amountToPay,
        mode
      );

      const transferAddress = await this.walletService.createWallet();
      
      let transaction;
      if (type == "HOSTED_CHECKOUT") {
        if (!redirectUrl) throw new APIError("Redirect URL is required for the specified payment method", STATUS.bad)
        transaction = await this.paymentRepository.createPayment(
          amount,
          amountToPay,
          currency,
          network,
          customer,
          txRef,
          depositAddress,
          transferAddress.address,
          transferAddress.derivationIndex,
          <string>user?.businessProfile?.id,
          mode,
          {
            paymentMethod: "HOSTED_CHECKOUT",
            redirectUrl,
          }
        );
      } else {
        transaction = await this.paymentRepository.createPayment(
          <number>payLink?.amount,
          amountToPay,
          currency,
          network,
          customer,
          txRef,
          depositAddress,
          transferAddress.address,
          transferAddress.derivationIndex,
          <string>user?.businessProfile?.id,
          mode,
          {
            paymentMethod: "PAYMENT_LINK",
            paylinkId: <string>payLink?.id,
          }
        );
      }

      await redisClient.set(transaction.id, JSON.stringify(
        {
          amount: transaction.amount,
          amountInUSDC: transaction.amountInUSDC,
          businessName: transaction.profile.businessName,
          depositAddress: transaction.payment?.depositAddress,
          transferAddress: transferAddress.address,
          redirectUrl: transaction.payment?.redirectUrl,
          mode: transaction.mode,
          currency: transaction.currency,
          network: transaction.network
        }
      ), "EX", 6000);
      return {
        message: "Payment created successfully",
        payload: {
          transaction,
          checkoutUrl: `${process.env.ORAFI_CHECHOUT_URL}/${transaction.id}`
        },
      };
    } catch (error: any) {
      throw new APIError(
        error.message || "Failed to create payment",
        error.status || STATUS.bad
      );
    }
  }

  private async sendEmailIfNotSent(
    paymentId: string,
    type: "success" | "failed",
    send: () => Promise<void>
  ) {
    const key = `payment:email:${type}:${paymentId}`;

    // atomic guarantee
    const ok = await redisClient.set(key, "true", "NX");

    if (!ok) {
      return;
    }

    await send();
  }


  private async confirmPayment(
    paymentId: string,
    customerId: string,
    amount: number,
    amountInUSDC: number,
    customerEmail: string,
    customerName: string,
    businessName: string,
    businessEmail: string,
    currency: string
  ) {
    await this.paymentRepository.confirmPaymentStatus(paymentId);
    await this.customerRepository.updateAmountSpent(customerId, amountInUSDC);

    await this.sendEmailIfNotSent(paymentId, "success", async () => {
      await this.emailQueue.addPaymentSuccessScheduler(
        customerEmail,
        customerName,
        amount,
        paymentId,
        businessName,
        businessEmail,
        currency
      );
    });
  }

  private async markPaymentFailed(
    tx: any,
    customer: any
  ) {
    await this.sendEmailIfNotSent(tx.id, "failed", async () => {
      await this.emailQueue.addPaymentFailedScheduler(
        String(customer?.email),
        String(customer?.firstname),
        tx.amount,
        tx.id
      );
    });
  }

  async verifyPayment(data: VerifyPaymentDto) {
    const { paymentId } = data;
    const tx = await this.paymentRepository.findPaymentById(paymentId);

    if (!tx) {
      throw new APIError("Payment session not found", STATUS.notFound);
    }

    const customer = await this.customerRepository.findCustomerById(
      String(tx.customerId)
    );

    const merchantEmail = (
      await this.userRepository.findUserById(String(tx.profile.userId))
    )?.email;

    await this.setActiveNetwork(tx.mode);

    let event: EventType;

    // ✅ already completed → ensure success email was sent
    if (tx.status === "COMPLETED") {
      await this.confirmPayment(
        tx.id,
        String(tx.customerId),
        tx.amount,
        tx.amountInUSDC,
        String(customer?.email),
        String(customer?.firstname),
        tx.profile.businessName,
        String(merchantEmail),
        tx.currency
      );

      event = "payment.success";
    }

    // 🔄 still pending → check chain
    else {
      try {
        const walletObject = await this.client.getObject({
          id: String(tx.payment?.depositAddress),
          options: { showContent: true },
        });

        if (!walletObject.data) {
          await this.confirmPayment(
            tx.id,
            String(tx.customerId),
            tx.amount,
            tx.amountInUSDC,
            String(customer?.email),
            String(customer?.firstname),
            tx.profile.businessName,
            String(merchantEmail),
            tx.currency
          );

          event = "payment.success";
        }
        else {
          await this.markPaymentFailed(tx, customer);
          event = "payment.failed";
        }
      } catch (error: any) {
        if (
          error.message?.includes("not find") ||
          error.message?.includes("deleted")
        ) {
          await this.confirmPayment(
            tx.id,
            String(tx.customerId),
            tx.amount,
            tx.amountInUSDC,
            String(customer?.email),
            String(customer?.firstname),
            tx.profile.businessName,
            String(merchantEmail),
            tx.currency
          );

          event = "payment.success";
        } else {
          await this.markPaymentFailed(tx, customer);
          event = "payment.failed";
        }
      }
    }

    await this.webhookQueue.addScheduler(tx.profileId, {
      event,
      data: {
        transactionId: tx.id,
        amount: tx.amount,
        currency: tx.currency,
        status: event === "payment.success" ? "success" : "failed",
        occuredAt: new Date().toISOString(),
      },
    });

    return {
      message: "Payment verification completed",
      payload: {
        status: event === "payment.success" ? "completed" : "failed",
        paymentId,
      },
    };
  }


  async verifyTransfer(data: VerifyPaymentDto) {
    const { paymentId } = data;
    const tx = await this.paymentRepository.findPaymentById(paymentId);

    if (!tx) {
      throw new APIError("Payment session not found", STATUS.notFound);
    }
    await this.setActiveNetwork(tx.mode);

    const { amountInUSDC, payment } = tx;
    const target = BigInt(Math.floor(Number(amountInUSDC) * 1_000_000));

    // Fetch every coin object in the deposit wallet across all pages
    const allCoins: Awaited<ReturnType<typeof this.client.getCoins>>["data"] = [];
    let cursor: string | null | undefined = undefined;
    do {
      const page = await this.client.getCoins({
        owner: tx.payment?.wallet?.address as string,
        coinType: this.payoutService.cointype,
        cursor,
      });
      allCoins.push(...page.data);
      cursor = page.hasNextPage ? page.nextCursor : undefined;
    } while (cursor);

    // ── Step 1: verify the payment was actually received ───────────────────
    // Sum every coin object in the deposit wallet to get the true received total.
    const receivedTotal = allCoins.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      0n
    );

    if (receivedTotal < target) {
      // Customer has not sent the required amount yet (or sent nothing at all)
      throw new APIError(
        `Payment not received: expected ${target} but wallet only holds ${receivedTotal}`,
        STATUS.bad
      );
    }

    // ── Step 2: select the best coin object for the forwarding transfer ────
    // Prefer the smallest single coin object that still covers the target
    // so we avoid splitting large objects unnecessarily.
    const matchingCoin = allCoins
      .filter(coin => BigInt(coin.balance) >= target)
      .sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? -1 : 1))[0] ?? null;

    if (!matchingCoin) {
      // Total balance is sufficient but fragmented across several small coin objects.
      // The job layer must merge them before it can forward a single transfer.
      throw new APIError(
        "Payment received but split across multiple coin objects — merging required before forwarding",
        STATUS.bad
      );
    }

    const derivedWalletBuffer = await deriveWallet(payment?.wallet?.derivationIndex as number);
    const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
    await transactionQueue.add("transfer-usdt", {
      walletPrivateKey: secretKey,
      coinObjectId: matchingCoin.coinObjectId,
      amount: target.toString(),
      toAddress: tx?.profile.wallet[0]?.address as string,
      mode: tx.mode,
    })

    await this.confirmPayment(
      tx.id,
      <string>tx.customerId,
      tx.amount,
      tx.amountInUSDC,
      <string>tx.customer?.email,
      <string>tx.customer?.firstname,
      tx.profile.businessName,
      <string>tx.profile.user?.email,
      tx.currency
    )

    return {
      message: "Transfer verification completed",
      payload: {
        status: "completed",
        paymentId
      }
    };
  }

}
