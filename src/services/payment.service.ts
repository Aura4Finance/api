import { CreatePaymentDto, VerifyPaymentDto } from "@/dto/payment.dto";
import { PaymentRepository } from "@/repositories/payment.repository";
import { Service } from "typedi";
import { WalletService } from "./wallet.service";
import { CustomerRepository } from "@/repositories/customer.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { UserRepository } from "@/repositories/user/user.repository";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Customer, Mode, PaymentMethod, Prisma, Token } from "../../generated/prisma";
import { WebhookQueue } from "./schedule.webhook.service";
import { EventType } from "@/dto/webhook.dto";
import { EmailQueue } from "./schedule.email.service";
import { jobs, transactionQueue } from "@/queues/transaction.queue";
import { deriveWallet } from "@/utils/wallet/derive-wallet";
import { getCoinType, getCoinDecimal } from "@/constants/tokens.constants";
import { getTokenPrice } from "@7kprotocol/sdk-ts";
import { redisClient } from "@/config/redis-config";

type UserWithProfile = Prisma.UserGetPayload<{
  include: { businessProfile: { include: { wallet: true } } }
}>;

@Service()
export class PaymentService {
  private client!: SuiClient;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly walletService: WalletService,
    private readonly customerRepository: CustomerRepository,
    private readonly userRepository: UserRepository,
    private readonly webhookQueue: WebhookQueue,
    private readonly emailQueue: EmailQueue
  ) { }

  private async setActiveNetwork(mode: Mode) {
    this.client = new SuiClient({ url: getFullnodeUrl(`${mode === "live" ? "mainnet" : "testnet"}`) });
  }

  private async resolveCustomer(
    businessProfileId: string,
    mode: Mode,
    customerId: string | undefined,
    customerDetails: CreatePaymentDto["customer"]
  ): Promise<Customer> {
    if (customerId) {
      const existingCustomer = await this.customerRepository.findCustomerById(customerId);
      if (!existingCustomer) {
        throw new APIError("Customer not found.", STATUS.notFound);
      }

      return existingCustomer;
    }

    if (customerDetails) {
      const { fullname, email } = customerDetails;
      const [customerFirstname, customerLastname] = fullname.trim().split(" ");

      if (!customerFirstname || !customerLastname) {
        throw new APIError("Customer name must include first and last name.", STATUS.bad);
      }

      const existingCustomer = await this.customerRepository.findCustomer(email);
      if (existingCustomer) {
        return existingCustomer;
      }

      return this.customerRepository.createCustomer(
        customerFirstname,
        customerLastname,
        email,
        businessProfileId,
        mode
      );
    }

    throw new APIError("Customer id or details are required.", STATUS.bad);
  }

  private async finalizePaymentCreation({
    user,
    mode,
    customer,
    amount,
    amountToPay,
    currency,
    network,
    txRef,
    paymentMethod,
    redirectUrl,
    paylinkId,
    subscriptionId,
  }: {
    user: UserWithProfile;
    mode: Mode;
    customer: Customer;
    amount: number;
    amountToPay: number;
    currency: string;
    network: CreatePaymentDto["network"];
    txRef: string;
    paymentMethod: PaymentMethod;
    redirectUrl?: string;
    paylinkId?: string;
    subscriptionId?: string;
  }) {
    const transaction = await this.
    paymentRepository.createPayment(
      amount,
      amountToPay,
      currency,
      network,
      customer,
      txRef,
      <string>user?.businessProfile?.id,
      mode,
      paymentMethod === "HOSTED_CHECKOUT"
        ? {
          paymentMethod,
          redirectUrl: redirectUrl as string,
        } : paymentMethod === "PAYMENT_LINK"
        ? {
          paymentMethod,
          paylinkId: paylinkId as string,
        } : {
          paymentMethod,
          subscriptionId: subscriptionId as string,
          billingCycleKey: subscriptionId as string,
        }
    );

    await redisClient.set(transaction.id, JSON.stringify(
      {
        amount: transaction.amount,
        amountInUSDC: transaction.amountInUSDC,
        businessName: transaction.profile.businessName,
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
        checkoutUrl: `${process.env.ORAFI_CHECHOUT_URL}/${transaction.id}`,
      },
    };
  }

  async createPayment(data: CreatePaymentDto, userId: string, mode: Mode) {
    await this.setActiveNetwork(mode);
    const user = (await this.userRepository.findUserById(userId)) as UserWithProfile;
    if (!user) {
      throw new APIError("User not found.", STATUS.notFound);
    }
        const customer = await this.resolveCustomer(<string>user?.businessProfile?.id, mode, data.customerId, data.customer);
        await this.customerRepository.addModeToCustomer(customer.id, mode);
        
        const merchantAddress = user?.businessProfile?.wallet[0]?.address;
        if (!merchantAddress) {
          throw new APIError("Merchant wallet address is not configured.", STATUS.bad);
        }

        let amount: number;
        let paymentMethod: PaymentMethod; 
        let currency: string;
        let redirectUrl: string | undefined = undefined;
        let paylinkId: string | undefined = undefined;
        let subscriptionId: string | undefined = undefined;
        try {
          if (data.type === PaymentMethod.HOSTED_CHECKOUT) {
            amount = data.amount;
            paymentMethod = PaymentMethod.HOSTED_CHECKOUT;
            currency = data.currency;
            redirectUrl = data.redirectUrl
          }else if(data.type == PaymentMethod.PAYMENT_LINK) {
            paymentMethod = PaymentMethod.PAYMENT_LINK;
            amount = <number>data.payLink?.amount
            currency = <string>data.payLink?.currency
            paylinkId = data.payLink?.id
          }else {
            paymentMethod = PaymentMethod.SUBSCRIPTION;
            subscriptionId = data.subscriptionId;
            amount = data.amount;
            currency = data.currency;
          }
          const amountToPay = await this.walletService.convertBetweenCurrencyAndUSDT(
            amount,
            currency,
            "to_USDT"
          );

          const finalizeArgs = {
            user,
            mode,
            customer,
            amount,
            amountToPay,
            currency,
            network: data.network,
            txRef: data.txRef,
            paymentMethod,
            ...(redirectUrl ? { redirectUrl } : {}),
            ...(paylinkId ? { paylinkId } : {}),
            ...(subscriptionId ? { subscriptionId } : {}),
          };
          return this.finalizePaymentCreation(finalizeArgs)

    } catch (error: unknown) {
      const typedError = error as { message?: string; status?: number };
      throw new APIError(
        "We couldn't create the payment. Please try again.",
        typedError.status || STATUS.bad
      );
    }
  }

  async generateDepositAddressForPaymentCompletion(
    transactionId: string,
    token: Token=Token.USDC
  ){
    const tx = await this.paymentRepository.findPaymentById(transactionId);

    if(!tx || tx.type !== "PAYMENT" || tx.status !== "PENDING"){
      throw new APIError("Payment transaction not found!", STATUS.notFound);
    }

    if(tx.payment?.depositAddress){
      return  {
      message: "Deposit address created successfully!",
      payload: tx.payment.depositAddress,
      }
    }
      let tokenPrice: number;
      if(token == Token.USDC){
        tokenPrice = tx.amountInUSDC;
      }else{
        const rate = await getTokenPrice(getCoinType(token, tx.mode === "live" ? "mainnet" : "testnet")!);
        if(!rate){
          throw new APIError("Unsupported token.", STATUS.bad);
        }
        tokenPrice = tx.amountInUSDC / rate;
      }

      const depositAddress = await this.walletService.generatePaymentWallet(
        <string>tx.profile.wallet[0]?.address,
        tokenPrice,
        token,
        tx.mode
      );
  
      await this.paymentRepository.addDepositAddressToPayment(
        tx.id,
        depositAddress,
        token
      )
  
      return {
        message: "Deposit address created successfully!",
        payload: depositAddress,
      }
  }

  async generateTransferAddressForPaymentCompletiion(
    transactionId: string
  ){
    const tx = await this.paymentRepository.findPaymentById(transactionId);

    if(!tx || tx.type !== "PAYMENT" || tx.status !== "PENDING"){
      throw new APIError("Payment transaction not found!", STATUS.notFound);
    }

    const existingPaymentWallet = tx.payment?.wallet?.[0];
    if (existingPaymentWallet) {
      return {
      message: "Transfer address created successfully!",
      payload: existingPaymentWallet.address,
    }
    }

    const wallet = await this.walletService.createWallet();
    await this.paymentRepository.addTransferAddressToPayment(
      tx.id,
      wallet.address,
      wallet.derivationIndex
    )

    return {
      message: "Transfer address created successfully!",
      payload: wallet.address,
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
    currency: string,
    mode: Mode,
    token?: Token
  ) {
    await this.paymentRepository.confirmPaymentStatus(paymentId, token);
    if (mode == "live") await this.customerRepository.updateAmountSpent(customerId, amountInUSDC);

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
    tx: Awaited<ReturnType<typeof this.paymentRepository.findPaymentById>> | null,
    customer: Customer | null
  ) {
    if (!tx || !customer) return;
    await this.sendEmailIfNotSent(tx.id, "failed", async () => {
      await this.emailQueue.addPaymentFailedScheduler(
        String(customer?.email),
        String(customer?.firstname),
        tx.amount,
        tx.id
      );
    });
  }

  async verifyPayment(data: Omit<VerifyPaymentDto, "token">) {
    const { paymentId } = data;
    const tx = await this.paymentRepository.findPaymentById(paymentId);

    if (!tx) {
      throw new APIError("Payment session not found.", STATUS.notFound);
    }

    const customer = await this.customerRepository.findCustomerById(
      String(tx.customerId)
    );

    const merchantEmail = tx.profile?.user?.email;

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
        tx.currency,
        tx.mode
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
            tx.currency,
            tx.mode
          );

          event = "payment.success";
        }
        else {
          await this.markPaymentFailed(tx, customer);
          event = "payment.failed";
        }
      } catch (error: unknown) {
        const typedError = error as { message?: string };
        if (
          typedError.message?.includes("not find") ||
          typedError.message?.includes("deleted")
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
            tx.currency,
            tx.mode
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
    let { paymentId, token } = data;
    if(!token) token = Token.USDC;
    const tx = await this.paymentRepository.findPaymentById(paymentId);

    if (!tx) {
      throw new APIError("Payment session not found.", STATUS.notFound);
    }
    const paymentWallet = tx.payment?.wallet?.[0];
    if(!paymentWallet?.address){
      throw new APIError("No transfer address found for this payment", STATUS.notFound);
    }
    await this.setActiveNetwork(tx.mode);

    const { amountInUSDC } = tx;
    const coinType = getCoinType(token, tx.mode === "live" ? "mainnet" : "testnet");
    if(!coinType){
      throw new APIError("Unsupported token for transfer verification.", STATUS.bad);
    }

    let target;
    if(token == Token.USDC){
      target = BigInt(Math.floor(Number(amountInUSDC) * getCoinDecimal(token)));
    }else {
      const rate = await getTokenPrice(coinType);
      if(!rate){
        throw new APIError("Failed to fetch token price.", STATUS.bad);
      }
      target = BigInt(Math.floor(Number(amountInUSDC / rate) * getCoinDecimal(token)));
    }


    // Fetch every coin object in the deposit wallet across all pages
    const allCoins: Awaited<ReturnType<SuiClient["getCoins"]>>["data"] = [];
    let cursor: string | null | undefined = undefined;
    do {
      const page = await this.client.getCoins({
        owner: paymentWallet.address,
        coinType,
        cursor,
      });
      allCoins.push(...page.data);
      cursor = page.hasNextPage ? page.nextCursor : undefined;
    } while (cursor);
    //verify the payment was actually received
    // Sum every coin object in the deposit wallet to get the true received total.
    const receivedTotal = allCoins.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      0n
    );

    if (receivedTotal < target) {

      // Customer has not sent the required amount yet (or sent nothing at all)
      throw new APIError(
        "Payment not received yet.",
        STATUS.paymentRequired
      );
    }

    // select the best coin object for the forwarding transfer
    // Prefer the smallest single coin object that still covers the target
    // so we avoid splitting large objects unnecessarily.
    const matchingCoin = allCoins
      .filter(coin => BigInt(coin.balance) >= target)
      .sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? -1 : 1))[0] ?? null;

    if (!matchingCoin) {
      // Total balance is sufficient but fragmented across several small coin objects.
      // The job layer must merge them before it can forward a single transfer.
      throw new APIError(
        "Payment received but split across multiple coin objects. Please retry shortly.",
        STATUS.paymentRequired
      );
    }

    const derivedWalletBuffer = await deriveWallet(paymentWallet.derivationIndex as number);
    const secretKey = await this.walletService.serializeDerivedKeyToSuiSecretKey(derivedWalletBuffer);
    
    await transactionQueue.add(jobs.SETTLE_PAYMENT, {
      walletPrivateKey: secretKey,
      coinObjectId: matchingCoin.coinObjectId,
      amount: target.toString(),
      toAddress: tx?.profile.wallet[0]?.address as string,
      token,
      mode: tx.mode,
    }, 
    {
      removeOnComplete: true,
    }
  )

    await this.confirmPayment(
      tx.id,
      <string>tx.customerId,
      tx.amount,
      tx.amountInUSDC,
      <string>tx.customer?.email,
      <string>tx.customer?.firstname,
      tx.profile.businessName,
      <string>tx.profile.user?.email,
      tx.currency,
      tx.mode,
      token,
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
