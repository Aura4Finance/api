import { Service } from "typedi";
import path from "path";
import fs from "fs";
import { resend } from "@/config/resend-config";
import { redisClient as redis } from "@/middlewares/rate-limit.middleware";

type TemplateVars = Record<string, string | number>;

@Service()
export class EmailService {
  private templatePath: string;
  private logoBase64: string;

  constructor() {
    this.templatePath = path.join(__dirname, "..", "html");
    this.logoBase64 = fs
      .readFileSync(path.join(this.templatePath, "attachments", "logo.png"))
      .toString("base64");
  }

  /**
   * Core reusable email sender
   */
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

  /* ---------------- OTP ---------------- */

  async sendOtp(to: string, otp: string) {
    const throttleKey = `email:otp:${to}`;

    const alreadySent = await redis.get(throttleKey);
    if (alreadySent) {
      throw new Error("OTP already sent. Please wait before requesting again.");
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

    // throttle OTP for 60 seconds
    await redis.set(throttleKey, "1", "EX", 60);
  }

  /* ---------------- GENERAL EMAILS ---------------- */

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

  /* ---------------- PAYMENTS ---------------- */

  async sendPaymentFailedEmail(
    to: string,
    name: string,
    amount: number,
    currency: string,
    reference: string
  ) {
    const key = `email:payment:failed:${reference}`;

    const alreadySent = await redis.get(key);
    if (alreadySent) return;

    await this.sendEmail(
      to,
      "Payment Failed – Please Try Again",
      "payment_failed",
      {
        name,
        amount,
        currency,
        reference,
        date: new Date().toLocaleString(),
      }
    );

    await redis.set(key, "1");
  }

  async sendPaymentSuccessEmail(
    to: string,
    name: string,
    amount: number,
    currency: string,
    reference: string,
    merchantName: string
  ) {
    const key = `email:payment:success:${reference}`;

    const alreadySent = await redis.get(key);
    if (alreadySent) return;

    await this.sendEmail(
      to,
      "Payment Successful 🎉",
      "payment_success",
      {
        name,
        amount,
        currency,
        reference,
        merchantName,
        date: new Date().toLocaleString("en-US", {
          year: "numeric",
          month: "long",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        }),
      }
    );

    await redis.set(key, "1");
  }

  async sendMerchantPaymentReceivedEmail(
    to: string,
    merchantName: string,
    customerName: string,
    amount: number,
    currency: string,
    reference: string
  ) {
    const key = `email:merchant:payment:${reference}`;

    const alreadySent = await redis.get(key);
    if (alreadySent) return;

    await this.sendEmail(
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

    await redis.set(key, "1");
  }
}
