import { Service } from "typedi";
import path from "path";
import fs from "fs";
import { resend } from "@/config/resend-config";

type TemplateVars = Record<string, string | number>;

@Service()
export class EmailService {
  private templatePath: string;

  constructor() {
    this.templatePath = path.join(__dirname, "..", "html");
  }

  /**
   * Core reusable email sender
   */
  private async sendEmail(
    to: string | string[],
    subject: string,
    type: string,
    variables: TemplateVars,
    notification: boolean = true
  ) {
    const logo = fs.readFileSync(path.join(this.templatePath, "attachments", "logo.png")).toString("base64");
    await resend.emails.send({
      from: notification ? 'OraFi <notifications@orafi.app>' : 'Chidi from OraFi <chidi@orafi.app>',
      to,
      subject,
      template: {
        id: type,
        variables
      },
      attachments: [
        {
          content: logo,
          filename: 'logo.png',
          contentId: 'logo@orafi',
        },
      ],
    });
  }

  private async createTemplate(
    name: string,
    alias: string,
    variables: any[] = []
  ) {
    const html = fs.readFileSync(path.join(this.templatePath, `${alias}.html`), 'utf-8');
    await resend.templates.create({ name, alias, html, variables }).publish();
    return await resend.templates.get(alias);
  }



  async sendOtp(to: string, otp: string) {
    let template = await resend.templates.get('otp');
    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate("OTP Email Template", "otp", [
        {
          key: 'otp',
          type: 'string',
          fallbackValue: '123456'
        },
        {
          key: "date",
          type: "string",
          fallbackValue: new Date().toLocaleDateString()
        }
      ]
      )
    }
    return this.sendEmail(
      to,
      "Your OraFi Verification Code",
      "otp",
      {
        otp,
        date: Date.now().toLocaleString()
      });
  }

  async sendWelcomeEmail(to: string, name: string) {
    let template = await resend.templates.get("welcome");
    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate("Welcome Email Template", "welcome", [
        {
          key: 'name',
          type: 'string',
          fallbackValue: 'Esteemed user'
        }
      ])
    }
    return this.sendEmail(
      to,
      "Welcome to OraFi",
      "welcome", { name }, false);
  }

  async sendOfferEmail(to: string) {
    let template = await resend.templates.get("offer");
    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate("Offers Email Template", "offer")
    }
    return this.sendEmail(
      to,
      "What OraFi offers",
      "offer", {}, false
    );
  }

  async sendProblemEmail(to: string, name: string) {
    let template = await resend.templates.get("problems");
    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate("Problems Email Template", "problems", [
        {
          key: 'name',
          type: 'string',
          fallbackValue: 'Esteemed user'
        }
      ])
    }
    return this.sendEmail(
      to,
      "Why OraFi Exists",
      "problems",
      { name }, false
    );

  }
  async sendOnBoardingEmail(to: string[] | string, name: string) {
    let template = await resend.templates.get("onboarded");
    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate("Onboarding Email Template", "onboarded", [
        {
          key: 'name',
          type: 'string',
          fallbackValue: 'Esteemed user'
        }
      ])
    }
    return this.sendEmail(
      to,
      "Complete your OraFi setup yo get started!",
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
    let template = await resend.templates.get("payment_failed");

    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate(
        "Payment Failed Email Template",
        "payment_failed",
        [
          { key: "name", type: "string", fallbackValue: "Customer" },
          { key: "amount", type: "number", fallbackValue: 0 },
          { key: "currency", type: "string", fallbackValue: "NGN" },
          { key: "reference", type: "string", fallbackValue: "N/A" },
          { key: "date", type: "string", fallbackValue: new Date().toLocaleString() }
        ]
      );
    }

    return this.sendEmail(
      to,
      "Payment Failed – Please Try Again",
      "payment_failed",
      {
        name,
        amount,
        currency,
        reference,
        date: new Date().toLocaleString()
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
    let template = await resend.templates.get("payment_success");

    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate(
        "Payment Success Email Template",
        "payment_success",
        [
          { key: "name", type: "string", fallbackValue: "Customer" },
          { key: "amount", type: "number", fallbackValue: 0 },
          { key: "currency", type: "string", fallbackValue: "USD" },
          { key: "reference", type: "string", fallbackValue: "N/A" },
          { key: "merchantName", type: "string", fallbackValue: "Merchant" },
          { key: "date", type: "string", fallbackValue: new Date().toLocaleString() }
        ]
      );
    }

    return this.sendEmail(
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
          timeZoneName: "short"
        })

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
    let template = await resend.templates.get("merchant_payment_received");

    if (template.data?.published_at == null || !template.data) {
      template = await this.createTemplate(
        "Merchant Payment Received Template",
        "merchant_payment_received",
        [
          { key: "merchantName", type: "string", fallbackValue: "Merchant" },
          { key: "customerName", type: "string", fallbackValue: "Customer" },
          { key: "amount", type: "number", fallbackValue: 0 },
          { key: "currency", type: "string", fallbackValue: "USD" },
          { key: "reference", type: "string", fallbackValue: "N/A" },
          { key: "date", type: "string", fallbackValue: new Date().toLocaleString() }
        ]
      );
    }

    return this.sendEmail(
      to,
      "You’ve Received a Payment 💰",
      "merchant_payment_received",
      {
        merchantName,
        customerName,
        amount,
        currency,
        reference,
        date: new Date().toLocaleString()
      }
    );
  }


}
