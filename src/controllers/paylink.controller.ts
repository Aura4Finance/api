import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { CreatePaylinkDto } from "@/dto/paylink.dto";
import { PaylinkService } from "@/services/paylink.service";
import { WalrusService } from "@/services/walrus.service";
import { APIError } from "@/utils/error-handler";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { createPaylinkValidation } from "@/validation/paylink.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class PaylinkController {
  constructor(
    private readonly paylinkService: PaylinkService,
    private readonly walrusService: WalrusService
  ) { }

 async createPaylink(req: RequestAuth, res: Response) {
  const userId = req.user?.id as string;

  const { error, value } = createPaylinkValidation(JSON.parse(req.body.payload));
  if (error) {
    return res.status(STATUS.bad).json({
      success: false,
      message: formatErrorValidation(error),
    });
  }

  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(STATUS.bad).json({
      success: false,
      message: "At least one image file is required",
    });
  }

  if (files.length > 4) {
    return res.status(STATUS.bad).json({
      success: false,
      message: "A maximum of 4 image files are allowed",
    });
  }

  for (const file of files) {
    if (!file.mimetype.startsWith("image/")) {
      return res.status(STATUS.forbidden).json({
        success: false,
        message: "Only image files are allowed",
      });
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

  const body: CreatePaylinkDto = value as CreatePaylinkDto;
  body.imageBlobIds = imageBlobIds;

  const { message, payload } =
    await this.paylinkService.createPaylink(userId, body);

  return res.status(STATUS.created).json({
    success: true,
    message,
    data: payload,
  });
}


  async getPaylinkDetails(req: RequestAuth, res: Response) {
    console.log("code")
    const paylinkId = req.params.id as string;

    if (!paylinkId) {
      throw new APIError("Invalid request", STATUS.bad);
    }

    const { message, payload } = await this.paylinkService.getPaylink(
      paylinkId
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getAllPaylinks(req: RequestAuth, res: Response) {
    const userId = req.user.id as string;

    const { message, payload } = await this.paylinkService.getAllPaylink(
      userId
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async deletePaymentLink(req: RequestAuth, res: Response) {
    const userId = req.user.id as string;
    const paylinkId = req.params.id as string;

    if (!paylinkId) {
      throw new APIError("Invalid request", STATUS.bad);
    }

    const { message, payload } = await this.paylinkService.deletePaylink(
      userId,
      paylinkId
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
