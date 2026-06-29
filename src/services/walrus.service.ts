import { Service } from "typedi";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import logger from "@/utils/logger";
import { Mode } from "@/generated/prisma/client";
import { createWalrusPublisherClient } from "@/config/walrus-publisher-config";
import sharp from "sharp";

type WalrusUploadResponse =
    | {
        newlyCreated: {
            blobObject: {
                id: string;
                blobId: string;
                size: number;
            };
        };
        alreadyCertified?: never;
    }
    | {
        alreadyCertified: {
            blobId: string;
            endEpoch: number;
        };
        newlyCreated?: never;
    };

@Service()
export class WalrusService {
    constructor() { }

    private async compressImage(imageBuffer: Uint8Array): Promise<Uint8Array> {
        try {
            const compressed = await sharp(imageBuffer)
                .resize(2048, 2048, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .webp({ quality: 80 })
                .toBuffer();

            logger.info(`Image compressed: ${imageBuffer.length} bytes → ${compressed.length} bytes`);
            return compressed;
        } catch (error: any) {
            logger.warn(`Image compression failed, using original: ${error.message}`);
            return imageBuffer;
        }
    }

    async uploadImageToWalrus(imageBuffer: Uint8Array, mode: Mode) {
        try {
            const compressedImage = await this.compressImage(imageBuffer);
            const publisher = createWalrusPublisherClient(mode);

            const result = await publisher.put<WalrusUploadResponse>(
                "/v1/blobs?epochs=2&deletable=true",
                compressedImage,
            );

            const data = result.data;

            const blobId = data.newlyCreated
                ? data.newlyCreated.blobObject.blobId
                : data.alreadyCertified.blobId;

            const blobObjectId = data.newlyCreated
                ? data.newlyCreated.blobObject.id
                : undefined;
            logger.info(`Walrus upload result: ${JSON.stringify(result.data)}`);
            
            return {
                blobId,
                blobObjectId
            }

        } catch (error: any) {
            logger.error(error);
            if (error instanceof APIError) throw error;
            throw new APIError("Unable to upload the file. Please try again.", STATUS.serverError);
        }
    }
}