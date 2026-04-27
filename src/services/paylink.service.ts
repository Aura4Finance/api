import { STATUS } from "@/constants/status.constant";
import { CreatePaylinkDto, PaylinkAIDescriptionDto } from "@/dto/paylink.dto";
import { PaylinkRepository } from "@/repositories/paylink.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { WalrusService } from "./walrus.service";
import { Service } from "typedi";
import { Mode } from "../../generated/prisma";
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "@/config/ollama-config";
import axios from "axios";

@Service()
export class PaylinkService {
  constructor
  (private readonly paylinkRepository: PaylinkRepository,
    private readonly userRepository: UserRepository,
    private readonly walrusService: WalrusService
  ) {}

  async createPaylink(userId: string, body: CreatePaylinkDto, mode: Mode) {
    const profile = await this.userRepository.findUserById(userId)
    const paylink = await this.paylinkRepository.createPaylink(
      profile?.businessProfile?.id as string, 
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

  async getAllPaylink(userId: string) {
      const profile = await this.userRepository.findUserById(userId);
      const paylinks = await this.paylinkRepository.getAllPaylinks(profile?.businessProfile?.id as string, profile?.businessProfile?.isLive? "live": undefined);

    return {
      message: "Paylinks retrived successfully",
      payload: paylinks,
    };
  }

  async deletePaylink(userId: string, paylinkId: string) {
    const profileId = await this.userRepository.findUserById(userId)
      .then((data) => data?.businessProfile?.id);

    await this.paylinkRepository.deletepaylink(profileId as string, paylinkId);
    return {
      message: "Paylink deleted successfully",
      payload: null
    }
  }

  async editPaylink(userId: string, paylinkId: string, body: Partial<CreatePaylinkDto>) {
    const profileId = await this.userRepository.findUserById(userId)
      .then((data) => data?.businessProfile?.id);
    const paylink = await this.paylinkRepository.editPaylink(<string>profileId, body, paylinkId);

    return {
      message: "Paylink updated successfully",
      payload: paylink,
    };
  }

  async deleteImage(userId: string, imageId: string, mode: Mode) {
    const profileId = await this.userRepository.findUserById(userId)
      .then((data) => data?.businessProfile?.id);
    const image = await this.paylinkRepository.getImageById(imageId, <string>profileId);

    if (!image) {
      throw new APIError("Image not found.", STATUS.notFound);
    }
    // Delete from Walrus
    await this.walrusService.deleteImageFromWalrus(image.blobObjectId, mode);

    // Delete from database
    await this.paylinkRepository.deleteImage(imageId);

    return {
      message: "Image deleted successfully",
      payload: null
    };
  }

  async generatePaylinkDescriptionWithAi(input: PaylinkAIDescriptionDto) {
    const guidanceByMode: Record<PaylinkAIDescriptionDto["mode"], { lead: string; highlightsTitle: string }> = {
      Compact: {
        lead: "Write a short markdown block with one H4 heading and a tight opening paragraph.",
        highlightsTitle: "Highlights",
      },
      Balanced: {
        lead: "Write a balanced markdown block with one H4 heading, a short opening paragraph, and a compact list of highlights.",
        highlightsTitle: "What it covers",
      },
      Detailed: {
        lead: "Write a fuller markdown block with a H4 heading, a short introduction, a who-it-is-for section, and a what-it-covers section.",
        highlightsTitle: "What it covers",
      },
      Persuasive: {
        lead: "Write a conversion-focused markdown block with a confident H4 heading, a benefit-led introduction, a why-it-stands-out section, and a direct call to action.",
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
      "You write concise, polished markdown descriptions for payment links.",
      "Return only markdown. Do not use code fences, JSON, or extra commentary.",
      "Use only H4, H5, or H6 headings. Never generate H1, H2, or H3 headings.",
      "The output should be easy to read in a payment form preview.",
      guidance.lead,
      `Mode: ${input.mode}.`,
      `Tone: ${input.tone?.trim() || "Professional"}.`,
      `Topic: ${topic}.`,
      `Audience: ${audience}.`,
      `Highlights to include (${guidance.highlightsTitle}): ${highlights}.`,
      `Call to action: ${callToAction}.`,
      `Rough notes: ${roughNotes}.`,
    ];

    try {
      const response = await axios.post(
        `${OLLAMA_BASE_URL}/api/generate`,
        {
          model: OLLAMA_MODEL,
          prompt: promptLines.join("\n"),
          stream: false,
        },
        {
          timeout: 30000,
        }
      );

      const content = response.data?.response?.trim();

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
