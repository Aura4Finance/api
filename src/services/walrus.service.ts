import { Service } from "typedi";
import { WalletService } from "@/services/wallet.service";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import logger from "@/utils/logger";
import { Mode } from "@/generated/prisma/client";
import { createWalrusPublisherClient } from "@/config/walrus-publisher-config";
import { SuiJsonRpcClient, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { walrus } from "@mysten/walrus";
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
    constructor(
        private readonly walletService: WalletService
    ) { }

    private getWalrusClient(network: 'mainnet' | 'testnet') {
        const isTestnet = network === "testnet";
        const url = isTestnet
            ? "https://sui-testnet.gateway.tatum.io"
            : "https://sui-mainnet.gateway.tatum.io";
        const apiKey = isTestnet
            ? process.env.TATUM_TESTNET_KEY
            : process.env.TATUM_MAINNET_KEY;

        return new SuiJsonRpcClient({
            network,
            transport: new JsonRpcHTTPTransport({
                url,
                rpc: {
                    headers: { "x-api-key": String(apiKey) },
                },
            }),
        }).$extend(walrus());
    }

    private getSigner() {
        return Ed25519Keypair.fromSecretKey(this.walletService.admin_secret_key);
    }

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

    async deleteImageFromWalrus(blobObjectId: string, mode: Mode) {
        try {
            const network = mode === Mode.live ? "mainnet" : "testnet";
            const client = this.getWalrusClient(network);
            const signer = this.getSigner();

            await client.walrus.executeDeleteBlobTransaction({
                blobObjectId,
                signer,
            });
        } catch (error: any) {
            logger.error(error);
            throw new APIError("Unable to delete the file. Please try again.", STATUS.serverError);
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

            return { blobId, blobObjectId };

        } catch (error: any) {
            logger.error(error);
            if (error instanceof APIError) throw error;
            throw new APIError("Unable to upload the file. Please try again.", STATUS.serverError);
        }
    }
}