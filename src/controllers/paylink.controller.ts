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
} from "@/validation/paylink.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class PaylinkController {
  constructor(
    private readonly paylinkService: PaylinkService,
    private readonly walrusService: WalrusService
  ) {}

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

    const imageBlobIds = await Promise.all(
      files.map(async (file) => {
        const { blobId } =
          await this.walrusService.uploadImageToWalrus(
            file.buffer,
            userId
          );
        return blobId;
      })
    );

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
    const paylinkId = req.params.id;

    if (!paylinkId) {
      throw new APIError("Invalid request", STATUS.bad);
    }

    const { message, payload } =
      await this.paylinkService.getPaylink(paylinkId);

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
    const paylinkId = req.params.id;

    if (!paylinkId) {
      throw new APIError("Invalid request", STATUS.bad);
    }

    const { message, payload } =
      await this.paylinkService.deletePaylink(userId, paylinkId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async editPaylink(req: RequestAuth, res: Response) {
    const userId = req.user.id as string;
    const paylinkId = req.params.id;

    if (!paylinkId) {
      throw new APIError("Invalid request", STATUS.bad);
    }

    const { value, error } = editPaylinkValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const files = req.files as Express.Multer.File[];

    const imageBlobIds = await this.processImages(files, userId, paylinkId);

    const body: Partial<CreatePaylinkDto> = {
      ...(value as CreatePaylinkDto),
      imageBlobIds,
    };

    const { message, payload } =
      await this.paylinkService.editPaylink(
        userId,
        paylinkId,
        body
      );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
