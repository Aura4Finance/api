import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { CreatePaylinkDto } from "@/dto/paylink.dto";
import { PaylinkService } from "@/services/paylink.service";
import { WalrusService } from "@/services/walrus.service";
import { APIError } from "@/utils/error-handler";
import { formatErrorValidation } from "@/utils/format-validation-error";
import {
  createPaylinkValidation,
  editPaylinkValidation,
  paymentLinkReferenceValidation,
  editPaymentLinkImageValidation
} from "@/validation/paylink.validation";
import { Response } from "express";
import { Service } from "typedi";
import { Mode } from "../../generated/prisma";
import { UserService } from "@/services/user/user.service";

@Service()
export class PaylinkController {
  constructor(
    private readonly paylinkService: PaylinkService,
    private readonly walrusService: WalrusService,
    private readonly userService: UserService,
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
        "At least one image file is required",
        STATUS.bad
      );
    }

    if (totalImages > 4) {
      throw new APIError(
        "A maximum of 4 image files are allowed",
        STATUS.bad
      );
    }

    for (const file of files) {
      if (!file.mimetype.startsWith("image/")) {
        throw new APIError("Only image files are allowed", STATUS.forbidden);
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
          blobObjectId: blobObject?.id?.id
        });
      }
    } catch (error) {
      throw new APIError("Unable to process image files", STATUS.serverError);
    }
    
    return images;
  }

  async createPaylink(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
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
    
    let mode: Mode;
    if(req.mode) {
      mode = req.mode;
    }else{
      const profile = await this.userService.getUserById(userId);
      mode = profile?.businessProfile?.isLive ? "live" : "test";
    }
    
    const images = await this.processImages(files, mode);

    const body: CreatePaylinkDto = {
      ...(value as CreatePaylinkDto),
      images,
    };
    const { message, payload } =
      await this.paylinkService.createPaylink(userId, body, mode);

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
    const userId = req.user.id as string;

    const { message, payload } =
      await this.paylinkService.getAllPaylink(userId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async deletePaymentLink(req: RequestAuth, res: Response) {
    const userId = req.user.id as string;
    const { error, value } = paymentLinkReferenceValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const { message, payload } =
      await this.paylinkService.deletePaylink(userId, value.paylinkId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async removeImageFromPaylink(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
   const { error, value } = editPaymentLinkImageValidation(<any>req.params);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    let mode: Mode;
    if(req.mode) {
      mode = req.mode;
    }else{
      const profile = await this.userService.getUserById(userId);
      mode = profile?.businessProfile?.isLive ? "live" : "test";
    }

    await this.paylinkService.deleteImage(userId, <string>value.imageId, mode);

    return res.status(STATUS.ok).json({
      success: true,
      message: "Image removed successfully",
      data: null,
    });
  }

  async editPaylink(req: RequestAuth, res: Response) {
    const userId = req.user.id as string;
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
    let mode: Mode;
    if(req.mode) {
      mode = req.mode;
    }else{
      const profile = await this.userService.getUserById(userId);
      mode = profile?.businessProfile?.isLive ? "live" : "test";
    }

    if(files && files.length > 0) {
      const newImages = await this.processImages(files, mode);
      body.images = newImages;
    } else {
      // If no new images, don't modify the images property
      delete (body as any).images;
    }

    const { message, payload } =
      await this.paylinkService.editPaylink(
        userId,
        refValue.paylinkId,
        body
      );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
