import { Service } from "typedi";
import path from "path";
import fs from "fs";
import { resend } from "@/config/resend-config";
import { generateReceiptPDF, generateReceiptNumber } from "@/utils/pdf-generator";
import { redisClient as redis } from "@/middlewares/rate-limit.middleware";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

type TemplateVars = Record<string, string | number>;

@Service()
export class EmailService {
  private templatePath: string;
  private logoBase64: string;
  private batch: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null; 
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_FLUSH_MS = 1000;

  constructor() {
    this.templatePath = path.join(__dirname, "..", "html");
    this.logoBase64 = fs
      .readFileSync(path.join(this.templatePath, "attachments", "logo.png"))
      .toString("base64");
  }

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
    throw new APIError("Error sending batch email", STATUS.bad);
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
  let attachments = [
     {
        content: this.logoBase64,
        filename: "logo.png",
        contentId: "logo@orafi",
      },
  ]

    if (receipt) {
      const receiptNumber = generateReceiptNumber(2);
      const pdfBuffer = await generateReceiptPDF({
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
      variables,
    },
    attachments
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
    return resend.emails.send({
      from: notification
        ? "OraFi <notifications@orafi.app>"
        : "Chidi from OraFi <chidi@orafi.app>",
      to,
      subject,
      template: {
        id: templateId,
        variables,
      },
      attachments: [
        {
          content: this.logoBase64,
          filename: "logo.png",
          contentId: "logo@orafi",
        },
      ],
    });
  }


  async sendOtp(to: string, otp: string) {
    const throttleKey = `email:otp:${to}`;

    const alreadySent = await redis.get(throttleKey);
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
   await redis.set(throttleKey, "1", "EX", 60 * 10);
  }


  async sendWelcomeEmail(to: string, name: string) {
    return this.sendEmail(
      to,
      "Welcome to OraFi",
      "welcome",
      { name },
      false
    );
  }

  async sendOfferEmail(to: string) {
    return this.sendEmail(
      to,
      "What OraFi Offers",
      "offer",
      {},
      false
    );
  }

  async sendProblemEmail(to: string, name: string) {
    return this.sendEmail(
      to,
      "Why OraFi Exists",
      "problems",
      { name },
      false
    );
  }

  async sendOnBoardingEmail(to: string | string[], name: string) {
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
    true,
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
  ) {

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

}
