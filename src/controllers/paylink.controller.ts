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
} from "@/validation/paylink.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class PaylinkController {
  constructor(
    private readonly paylinkService: PaylinkService,
    private readonly walrusService: WalrusService
  ) { }

  private async processImages(
    files: Express.Multer.File[],
    userId: string,
    paylinkId?: string
  ): Promise<string[]> {
    let existingImageCount = 0;

    if (paylinkId) {
      const paylink = await this.paylinkService.getPaylink(paylinkId);
      existingImageCount = paylink.payload.imageBlobIds.length;
    }

    const totalImages = (files?.length || 0) + existingImageCount;

    if (totalImages === 0) {
      throw new APIError(
        "At least one image file is required",
        STATUS.bad
      );
    }

    if (files.length + existingImageCount > 4) {
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
    let imageBlobIds: string[] = []
    try{
      imageBlobIds = await Promise.all(
        files.map(async (file) => {
          const { blobId } =
            await this.walrusService.uploadImageToWalrus(
              file.buffer,
              userId
            );
          return blobId;
        })
      );

    }
    catch{
      throw new APIError("Unable to process image files", STATUS.serverError)
    }


    return imageBlobIds;
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

    const imageBlobIds = await this.processImages(files, userId);

    const body: CreatePaylinkDto = {
      ...(value as CreatePaylinkDto),
      imageBlobIds,
    };

    const { message, payload } =
      await this.paylinkService.createPaylink(userId, body);

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

    if(files.length > 0) {
      const newImageBlobIds = await this.processImages(files, userId, refValue.paylinkId);
      body.imageBlobIds = newImageBlobIds;
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
