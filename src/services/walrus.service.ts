import { SuiGrpcClient } from "@mysten/sui/grpc";
import { walrus, RetryableWalrusClientError } from "@mysten/walrus";
import { Service } from "typedi";
import { WalletService } from "./wallet.service";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import logger from "@/utils/logger";
import { Mode } from "@generated/prisma
import sharp from "sharp";

const UPLOAD_RELAY_URLS = {
    mainnet: "https://upload-relay.mainnet.walrus.space",
    testnet: "https://upload-relay.testnet.walrus.space",
};

@Service()
export class WalrusService {
    constructor(
        private readonly walletSerice: WalletService
    ) { }

    private getWalrusClient(network: 'mainnet' | 'testnet') {
        return new SuiGrpcClient({
            baseUrl: getJsonRpcFullnodeUrl(network),
            network,
        }).$extend(
            walrus({
                uploadRelay: {
                    host: UPLOAD_RELAY_URLS[network],
                    sendTip: { max: 1_000_000_000 },
                }
            })
        );
    }

    private getSigner() {
        return Ed25519Keypair.fromSecretKey(this.walletSerice.admin_secret_key);
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
            const network = mode === Mode.live ? "mainnet" : "testnet";
            const client = this.getWalrusClient(network);
            const signer = this.getSigner();

            const compressedImage = await this.compressImage(imageBuffer);

            const upload = () =>
                client.walrus.writeBlob({
                    blob: compressedImage,
                    deletable: true,
                    epochs: 2,
                    signer,
                });

            const { blobId, blobObject } = await upload().catch(async (error: any) => {
                if (error instanceof RetryableWalrusClientError) {
                    client.walrus.reset();
                    return upload();
                }
                throw new APIError(
                    "Unable to upload the file. Please try again.",
                    STATUS.serverError
                );
            });

            return { blobId, blobObject };
        } catch (error: any) {
            logger.error(error);
            throw new APIError("Unable to upload the file. Please try again.", STATUS.serverError);
        }
    }
}