import { STATUS } from "@/constants/status.constant";
import { CreatePaylinkDto } from "@/dto/paylink.dto";
import { PaylinkRepository } from "@/repositories/paylink.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { WalrusService } from "./walrus.service";
import { Service } from "typedi";

@Service()
export class PaylinkService {
  constructor
  (private readonly paylinkRepository: PaylinkRepository,
    private readonly userRepository: UserRepository,
    private readonly walrusService: WalrusService
  ) {}

  async createPaylink(userId: string, body: CreatePaylinkDto) {
    const profile = await this.userRepository.findUserById(userId)
    const paylink = await this.paylinkRepository.createPaylink(
      profile?.businessProfile?.id as string, 
      body,
      profile?.businessProfile?.isLive? "live" : "test"
    );

    return {
      message: "Paylink successfully created",
      payload: paylink,
    };
  }

  async getPaylink(paylinkId: string) {
    const paylink = await this.paylinkRepository.getPaylink(paylinkId);

    if (!paylink) {
      throw new APIError("Paylink not found", STATUS.notFound);
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
    const paylink = await this.paylinkRepository.editPaylink(profileId as string, body, paylinkId);

    return {
      message: "Paylink updated successfully",
      payload: paylink,
    };
  }

  async deleteImage(userId: string, imageId: string) {
    const image = await this.paylinkRepository.getImageById(imageId);

    if (!image) {
      throw new APIError("Image not found", STATUS.notFound);
    }

    // Delete from Walrus
    await this.walrusService.deleteImageFromWalrus(image.blobObjectId, userId);

    // Delete from database
    await this.paylinkRepository.deleteImage(imageId);

    return {
      message: "Image deleted successfully",
      payload: null,
    };
  }
}
