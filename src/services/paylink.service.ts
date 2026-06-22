import { STATUS } from "@/constants/status.constant";
import { CreatePaylinkDto, PaylinkAIDescriptionDto } from "@/dto/paylink.dto";
import { PaylinkRepository } from "@/repositories/paylink.repository";
import { APIError } from "@/utils/error-handler";
import { WalrusService } from "@/services/walrus.service";
import { Service } from "typedi";
import { Mode } from "@/generated/prisma/client";
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "@/config/ollama-config";
import axios from "axios";

@Service()
export class PaylinkService {
  constructor
  (private readonly paylinkRepository: PaylinkRepository,
    private readonly walrusService: WalrusService
  ) {}

  async createPaylink(profileId: string, body: CreatePaylinkDto, mode: Mode) {
    const paylink = await this.paylinkRepository.createPaylink(
      profileId, 
      body,
      mode
    );

    return {
      message: "Paylink successfully created",
      payload: paylink,
    };
  }

  async getPaylink(paylinkId: string) {
    const paylink = await this.paylinkRepository.getPaylink(paylinkId);

    if (!paylink) {
      throw new APIError("Paylink not found.", STATUS.notFound);
    }

    return {
      message: "Paylink retrieved successfully",
      payload: paylink,
    };
  }

  async getAllPaylink(profileId: string, isLive: boolean) {
      const paylinks = await this.paylinkRepository.getAllPaylinks(profileId, isLive? "live": undefined);

    return {
      message: "Paylinks retrived successfully",
      payload: paylinks,
    };
  }

  async deletePaylink(profileId: string, paylinkId: string) {
    await this.paylinkRepository.deletepaylink(profileId, paylinkId);
    return {
      message: "Paylink deleted successfully",
      payload: null
    }
  }

  async editPaylink(profileId: string, paylinkId: string, body: Partial<CreatePaylinkDto>) {
    const paylink = await this.paylinkRepository.editPaylink(profileId, body, paylinkId);

    return {
      message: "Paylink updated successfully",
      payload: paylink,
    };
  }

  async deleteImage(profileId: string, imageId: string, mode: Mode) {
    const image = await this.paylinkRepository.getImageById(imageId, profileId);

    if (!image) {
      throw new APIError("Image not found.", STATUS.notFound);
    }
    // Delete from Walrus
    await this.walrusService.deleteImageFromWalrus(image.blobObjectId, mode);

    // Delete from database
    await this.paylinkRepository.deleteImage(imageId, profileId);

    return {
      message: "Image deleted successfully",
      payload: null
    };
  }

  async generatePaylinkDescriptionWithAi(input: PaylinkAIDescriptionDto) {
    const guidanceByMode: Record<PaylinkAIDescriptionDto["mode"], { lead: string; highlightsTitle: string }> = {
      Compact: {
        lead: "Write a short markdown block with one #### heading and a tight opening paragraph.",
        highlightsTitle: "Highlights",
      },
      Balanced: {
        lead: "Write a balanced markdown block with one #### heading, a short opening paragraph, and a compact list of highlights.",
        highlightsTitle: "What it covers",
      },
      Detailed: {
        lead: "Write a fuller markdown block with a #### heading, a short introduction, a who-it-is-for section, and a what-it-covers section.",
        highlightsTitle: "What it covers",
      },
      Persuasive: {
        lead: "Write a conversion-focused markdown block with a confident #### heading, a benefit-led introduction, a why-it-stands-out section, and a direct call to action.",
        highlightsTitle: "Why it stands out",
      },
    };

    const guidance = guidanceByMode[input.mode];
    const topic = input.topic?.trim() || "the payment link";
    const audience = input.audience?.trim() || "the intended customer";
    const highlights = input.highlights?.trim() || "key benefits, inclusions, or details";
    const callToAction = input.callToAction?.trim() || "Proceed to checkout to complete the payment.";
    const roughNotes = input.roughNotes?.trim() || "none provided";

    const promptLines = [
      "You are a payment-link copywriter producing a detailed, structured markdown description.",
      "Return only markdown. Do not use code fences, JSON, or extra commentary.",
      "Use only markdown headings with four or more hashes (####, #####, ######).",
      "Never generate H1, H2, or H3 headings and do not use any heading level below ####.",
      "Make the output clear, scannable, and safe for a payment form preview.",
      "Include more context, helpful detail, and explicit instructions on how to proceed.",
      "Avoid emojis and placeholder text.",
      guidance.lead,
      `Mode: ${input.mode}.`,
      `Tone: ${input.tone?.trim() || "Professional"}.`,
      `Topic: ${topic}.`,
      `Audience: ${audience}.`,
      `Highlights to include (${guidance.highlightsTitle}): ${highlights}.`,
      `Call to action: ${callToAction}.`,
      `Rough notes: ${roughNotes}.`,
      "Structure requirements:",
      "- Start with one #### heading as the title.",
      "- Add a short overview paragraph with context and purpose.",
      "- Add a #### or ##### section for who it is for when audience is provided.",
      "- Add a #### or ##### section for details or coverage and include a short list.",
      "- End with a #### or ##### next-step section and a direct instruction to complete payment.",
    ];

    try {
      const response = await axios.post(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
          model: OLLAMA_MODEL,
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "You are a payment-link copywriter. Follow the user instructions precisely.",
            },
            {
              role: "user",
              content: promptLines.join("\n"),
            },
          ],
          options: {
            temperature: 0.6,
            top_p: 0.9,
          },
        },
        {
          timeout: 30000,
        }
      );

      const content = response.data?.message?.content?.trim();

      if (!content) {
        throw new APIError("AI response was empty.", STATUS.serverError);
      }

      return {
        message: "AI description generated successfully",
        payload: content,
      };
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Unable to generate the description right now.";
      throw new APIError(message, STATUS.serverError);
    }
  }
}
