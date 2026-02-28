import { Service } from "typedi";
import path from "path";
import fs from "fs";
import { resend } from "@/config/resend-config";
import { redisClient as redis } from "@/middlewares/rate-limit.middleware";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

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

  buildEmailPayload(
  to: string | string[],
  subject: string,
  templateId: string,
  variables: TemplateVars,
  notification = true
) {
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
    attachments: [
      {
        content: this.logoBase64,
        filename: "logo.png",
        contentId: "logo@orafi",
      },
    ],
  };
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


  async sendOtp(to: string, otp: string) {
    // const throttleKey = `email:otp:${to}`;

    // const alreadySent = await redis.get(throttleKey);
    // if (alreadySent) {
    //   throw new APIError("OTP already sent. Please wait before requesting again.", STATUS.tooManyRequests);
    // }

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
   // await redis.set(throttleKey, "1", "EX", 60 * 10);
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

  }

  async sendPaymentSuccessEmail(
    to: string,
    name: string,
    amount: number,
    currency: string,
    reference: string,
    merchantName: string
  ) {

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

  }

  async sendMerchantPaymentReceivedEmail(
    to: string,
    merchantName: string,
    customerName: string,
    amount: number,
    currency: string,
    reference: string
  ) {

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
  }
}
