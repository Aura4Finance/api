import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { CreatePaylinkDto, PaylinkAIDescriptionDto } from "@/dto/paylink.dto";
import { PaylinkService } from "@/services/paylink.service";
import { WalrusService } from "@/services/walrus.service";
import { APIError } from "@/utils/error-handler";
import { formatErrorValidation } from "@/utils/format-validation-error";
import {
  createPaylinkValidation,
  editPaylinkValidation,
  paymentLinkReferenceValidation,
  editPaymentLinkImageValidation,
  paylinkAIDescriptionValidation
} from "@/validation/paylink.validation";
import { Response } from "express";
import { Service } from "typedi";
import { Mode } from "@/generated/prisma/client";

@Service()
export class PaylinkController {
  constructor(
    private readonly paylinkService: PaylinkService,
    private readonly walrusService: WalrusService
  ) { }

  private async processImages(
    files: Express.Multer.File[],
    mode: Mode,
    paylinkId?: string
  ): Promise<Array<{ blobId: string; blobObjectId: string }>> {
    let existingImageCount = 0;
    let images: Array<{ blobId: string; blobObjectId: string }> = [];

    if (paylinkId) {
      const paylink = await this.paylinkService.getPaylink(paylinkId);
      existingImageCount = paylink.payload.images.length;
    }

    const totalImages = (files?.length || 0) + existingImageCount;

    if (totalImages === 0) {
      throw new APIError(
        "Please upload at least one image.",
        STATUS.bad
      );
    }

    if (totalImages > 4) {
      throw new APIError(
        "You can upload up to 4 images.",
        STATUS.bad
      );
    }

    for (const file of files) {
      if (!file.mimetype.startsWith("image/")) {
        throw new APIError("Only image files are supported.", STATUS.forbidden);
      }
    }

    try {
      for (const file of files) {
        const { blobId, blobObject } = await this.walrusService.uploadImageToWalrus(
          file.buffer,
          mode
        );
        images.push({
          blobId,
          blobObjectId: blobObject?.id
        });
      }
    } catch (error: any) {
      console.log(error)
      throw new APIError("We couldn't process the uploaded images. Please try again.", STATUS.serverError);
    }
    
    return images;
  }

  async createPaylink(req: RequestAuth, res: Response) {
    const profileId = req.user?.businessProfile.id as string;
    const { error, value } = createPaylinkValidation(
      JSON.parse(req.body.payload)
    );

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }
    const files = req.files as Express.Multer.File[];  
    const images = await this.processImages(files, req.mode);

    const body: CreatePaylinkDto = {
      ...(value as CreatePaylinkDto),
      images,
    };
    const { message, payload } =
      await this.paylinkService.createPaylink(profileId, body, req.mode);

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getPaylinkDetails(req: RequestAuth, res: Response) {
     const { error, value } = paymentLinkReferenceValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const { message, payload } =
      await this.paylinkService.getPaylink(value.paylinkId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getAllPaylinks(req: RequestAuth, res: Response) {
    const profileId = req.user?.businessProfile.id as string;
    const isLive = req.user.businessProfile.isLive;

    const { message, payload } =
      await this.paylinkService.getAllPaylink(profileId, isLive);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async deletePaymentLink(req: RequestAuth, res: Response) {
    const profileId = req.user?.businessProfile.id as string;
    const { error, value } = paymentLinkReferenceValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const { message, payload } =
      await this.paylinkService.deletePaylink(profileId, value.paylinkId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async removeImageFromPaylink(req: RequestAuth, res: Response) {
    const profileId = req.user?.businessProfile.id as string;
   const { error, value } = editPaymentLinkImageValidation(<any>req.params);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }
    await this.paylinkService.deleteImage(profileId, <string>value.imageId, req.mode);

    return res.status(STATUS.ok).json({
      success: true,
      message: "Image removed successfully",
      data: null,
    });
  }

  async editPaylink(req: RequestAuth, res: Response) {
    const profileId = req.user?.businessProfile.id as string;
    const { error: refError, value: refValue } = paymentLinkReferenceValidation(req.params as any);

    if (refError) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(refError),
      });
    }

    const { value, error } = editPaylinkValidation(JSON.parse(req.body.payload));

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const files = req.files as Express.Multer.File[];
    let body: Partial<CreatePaylinkDto> = value as CreatePaylinkDto;

    if(files && files.length > 0) {
      const newImages = await this.processImages(files, req.mode);
      body.images = newImages;
    } else {
      // If no new images, don't modify the images property
      delete (body as any).images;
    }

    const { message, payload } =
      await this.paylinkService.editPaylink(
        profileId,
        refValue.paylinkId,
        body
      );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async generatePaylinkDescription(req: RequestAuth, res: Response) {
    const { error, value } = paylinkAIDescriptionValidation(req.body as PaylinkAIDescriptionDto);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const { message, payload } =
      await this.paylinkService.generatePaylinkDescriptionWithAi(value as PaylinkAIDescriptionDto);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
