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
    const promptLines = [
      "You are a helpful product copywriter for payment links.",
      "Return markdown only. Do not wrap in code fences.",
      `Mode: ${input.mode}.`,
      `Tone: ${input.tone?.trim() || "Professional"}.`,
    ];

    if (input.topic?.trim()) {
      promptLines.push(`Topic: ${input.topic.trim()}.`);
    }

    if (input.audience?.trim()) {
      promptLines.push(`Audience: ${input.audience.trim()}.`);
    }

    if (input.highlights?.trim()) {
      promptLines.push(`Highlights: ${input.highlights.trim()}.`);
    }

    if (input.callToAction?.trim()) {
      promptLines.push(`Call to action: ${input.callToAction.trim()}.`);
    }

    if (input.roughNotes?.trim()) {
      promptLines.push(`Notes: ${input.roughNotes.trim()}.`);
    }

    promptLines.push(
      "Keep it concise, structured, and ready to paste into a paylink description."
    );

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
