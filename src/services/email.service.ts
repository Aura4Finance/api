import { Service } from "typedi";
import { resend } from "@/config/resend-config";
import { generateReceiptPDF, generateReceiptNumber } from "@/utils/pdf-generator";
import { redisClient } from "@/config/redis-config";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

type TemplateVars = Record<string, string | number | undefined>;

@Service()
export class EmailService {
  private batch: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null; 
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_FLUSH_MS = 1000;

  constructor() { }

  private readonly RATE_LIMIT = 2; // max calls per second

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async flushBatch() {
    if (this.batch.length === 0) return;

    const payload = [...this.batch];
    this.batch = [];

    try {
      for (let i = 0; i < payload.length; i += this.RATE_LIMIT) {
        const chunk = payload.slice(i, i + this.RATE_LIMIT);
        await Promise.all(chunk.map(email => resend.emails.send(email)));
        if (i + this.RATE_LIMIT < payload.length) {
          await this.delay(1000);
        }
      }
    } catch (err) {
      throw new APIError("Unable to send emails. Please try again later.", STATUS.bad);
    }
  }

  private async queueEmail(emailPayload: any) {
    this.batch.push(emailPayload);

    if (this.batch.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(async () => {
        await this.flushBatch();
        this.flushTimer = null;
      }, this.BATCH_FLUSH_MS);
    }
  }

  async buildEmailPayload(
    to: string | string[],
    subject: string,
    templateId: string,
    variables: TemplateVars,
    notification = true,
    receipt = false
  ) {
    const templateVariables = Object.fromEntries(
      Object.entries(variables).filter(([, value]) => value !== undefined)
    ) as Record<string, string | number>;

    let attachments: any[] = [];

    if (receipt) {
      const receiptNumber = generateReceiptNumber(2);
      // Note: If your PDF generator requires a logo image URL/Base64, 
      // you may need to pass a public asset URL here instead.
      const pdfBuffer = await generateReceiptPDF({
        logo: "https://orafi.app/logo.png", 
        receiptNumber, 
        date: new Date().toUTCString(),
        name: variables.name,
        merchantName: variables.merchantName || null,
        reference: variables.reference,
        network: "SUI",
        currency: variables.currency,
        amount: variables.amount,
        subtotal: variables.amount,
        networkFee: 0
      });
      const base64String = Buffer
        .from(pdfBuffer)   // convert Uint8Array → Buffer
        .toString("base64");
      attachments.push({
        content: base64String,
        filename: `OraFi-Receipt-${receiptNumber}.pdf`,
        contentId: "receipt@orafi",
      });
    }
    
    return {
      from: notification
        ? "OraFi <notifications@orafi.app>"
        : "Chidi from OraFi <chidi@orafi.app>",
      to: Array.isArray(to) ? to : [to],
      subject,
      template: {
        id: templateId,
        variables: templateVariables,
      },
      ...(attachments.length > 0 ? { attachments } : {})
    };
  }

  /**
   * Core reusable email sender
   */

  async sendBatchEmail(payload: any){
    await resend.batch.send(payload)
  }

  private async sendEmail(
    to: string | string[],
    subject: string,
    templateId: string,
    variables: TemplateVars,
    notification: boolean = true
  ) {
    const templateVariables = Object.fromEntries(
      Object.entries(variables).filter(([, value]) => value !== undefined)
    ) as Record<string, string | number>;

    return resend.emails.send({
      from: notification
        ? "OraFi <notifications@orafi.app>"
        : "Chidi from OraFi <chidi@orafi.app>",
      to,
      subject,
      template: {
        id: templateId,
        variables: templateVariables,
      },
    });
  }

  async sendOtp(to: string, otp: string) {
    const throttleKey = `email:otp:${to}`;

    const alreadySent = await redisClient.get(throttleKey);
    if (alreadySent) {
      throw new APIError("OTP already sent. Please wait before requesting again.", STATUS.tooManyRequests);
    }

    await this.sendEmail(
      to,
      "Your OraFi Verification Code",
      "otp",
      {
        otp,
        date: new Date().toLocaleString(),
      }
    );

    //throttle OTP for 60 seconds
    await redisClient.set(throttleKey, "1", "EX", 60);
  }

  async sendWelcomeEmail(to: string, name: string): Promise<any> {
    return this.sendEmail(
      to,
      "Welcome to OraFi",
      "welcome",
      { name },
      false
    );
  }

  async sendOfferEmail(to: string): Promise<any> {
    return this.sendEmail(
      to,
      "What OraFi Offers",
      "offer",
      {},
      false
    );
  }

  async sendProblemEmail(to: string, name: string): Promise<any> {
    return this.sendEmail(
      to,
      "Why OraFi Exists",
      "problems",
      { name },
      false
    );
  }

  async sendOnBoardingEmail(to: string | string[], name: string): Promise<any> {
    return this.sendEmail(
      to,
      "Complete your OraFi setup to get started!",
      "onboarded",
      { name }
    );
  }

  async sendPaymentFailedEmail(
    to: string,
    name: string,
    amount: number,
    currency: string,
    reference: string
  ) {
    const payload = await this.buildEmailPayload(
      to,
      "Payment Failed – Please Try Again",
      "payment_failed",
      {
        name,
        amount,
        currency,
        reference,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendPaymentSuccessEmail(
    to: string,
    name: string,
    amount: number,
    currency: string,
    reference: string,
    merchantName: string
  ) {
    const payload = await this.buildEmailPayload(
      to,
      "Payment Successful 🎉",
      "payment_success",
      {
        name,
        amount,
        currency,
        reference,
        merchantName,
        date: new Date().toLocaleString(),
      },
      true,
      true
    );

    await this.queueEmail(payload);
  }

  async sendMerchantPaymentReceivedEmail(
    to: string,
    merchantName: string,
    customerName: string,
    amount: number,
    currency: string,
    reference: string
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      "You’ve Received a Payment 💰",
      "merchant_payment_received",
      {
        merchantName,
        customerName,
        amount,
        currency,
        reference,
        date: new Date().toLocaleString(),
      }
    );
    await this.queueEmail(payload);
  }

  async sendSubscriptionReminderEmail(
    to: string,
    variables: {
      customerName: string;
      merchantName: string;
      planName: string;
      duration: string;
      amountDue?: string | number;
      currency?: string;
      daysLeft: number;
      expiresAt: string;
      checkoutUrl?: string;
    }
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      `${variables.planName} renews soon`,
      "subscription-remainder",
      {
        ...variables,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendSubscriptionExpiredEmail(
    to: string,
    variables: {
      customerName: string;
      merchantName: string;
      planName: string;
      duration: string;
      expiresAt: string;
      checkoutUrl?: string;
    }
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      `${variables.planName} has expired`,
      "subscription-expired",
      {
        ...variables,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendSubscriptionTrialEndedEmail(
    to: string,
    variables: {
      customerName: string;
      merchantName: string;
      planName: string;
      duration: string;
      trialDays: number;
      graceHours: number;
      trialEndedAt: string;
      checkoutUrl?: string;
    }
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      `${variables.planName} free trial has ended`,
      "subscription-trial-ended",
      {
        ...variables,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendSubscriptionCancelledEmail(
    to: string,
    variables: {
      customerName: string;
      merchantName: string;
      planName: string;
      duration: string;
      cancelledAt: string;
      expiresAt?: string;
    }
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      `${variables.planName} subscription cancelled`,
      "subscription-cancelled",
      {
        ...variables,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendSubscriptionActiveEmail(
    to: string,
    variables: {
      customerName: string;
      merchantName: string;
      planName: string;
      duration: string;
      amount?: number;
      currency?: string;
      startsAt: string;
      expiresAt: string;
    }
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      `${variables.planName} subscription is active`,
      "subscription-activated",
      {
        ...variables,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendSubscriptionAbandonedEmail(
    to: string,
    variables: {
      customerName: string;
      merchantName: string;
      planName: string;
      checkoutUrl?: string;
    }
  ): Promise<any> {
    const payload = await this.buildEmailPayload(
      to,
      `${variables.planName} subscription incomplete`,
      "subscription-abandoned",
      {
        ...variables,
        date: new Date().toLocaleString(),
      },
      true
    );

    await this.queueEmail(payload);
  }

  async sendWaitlistEmail(
    to: string,
  ): Promise<void>{
    const payload = await this.buildEmailPayload(
      to,
      `You've been added to the OraFi waitlist!`,
      "waitlist-email",
      {
        to
      },
      false
    );
    await this.queueEmail(payload);
  }
  }
      
