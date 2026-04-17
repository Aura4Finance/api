import { getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { walrus, RetryableWalrusClientError } from "@mysten/walrus";
import { Service } from "typedi";
import { WalletService } from "./wallet.service";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import logger from "@/utils/logger";
import { Mode } from "../../generated/prisma";
import sharp from "sharp";


@Service()
export class WalrusService {
    constructor(
        private readonly walletSerice: WalletService
    ) { }

    private getWalrusClient(network: 'mainnet' | 'testnet') {
        
        return new SuiJsonRpcClient({
            url: getFullnodeUrl(network),
            network,
        }).$extend(
            walrus({
                uploadRelay: {
                    host: network === "testnet" 
                        ? "https://upload-relay.testnet.walrus.space" 
                        : "https://upload-relay.mainnet.walrus.space",
                    sendTip: { max: 1_000_000_000 }, // 1k SUI, adjust as needed
                }
            }
        )
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
            const suiJsonRpcClient = this.getWalrusClient(network);
            const signer = this.getSigner();

            const storage = suiJsonRpcClient.walrus.deleteBlob({ blobObjectId });
            const tx = new Transaction();
            tx.transferObjects([storage], signer.getPublicKey().toSuiAddress());
            
            await suiJsonRpcClient.signAndExecuteTransaction({
                signer,
                transaction: tx,
                options: { showEffects: true, showObjectChanges: true },
            });
        } catch (error: any) {
            logger.error(error);
            throw new APIError(`Blob deletion failed: ${error.message}`, STATUS.serverError);
        }
    }

    async uploadImageToWalrus(imageBuffer: Uint8Array, mode: Mode) {
        try {
            const network = mode === Mode.live ? "mainnet" : "testnet";
            const suiJsonRpcClient = this.getWalrusClient(network);
            const signer = this.getSigner();

            // Compress image to reduce blob size and lower tip amount
            const compressedImage = await this.compressImage(imageBuffer);

            const upload = () =>
                suiJsonRpcClient.walrus.writeBlob({
                    blob: compressedImage,
                    deletable: true,
                    epochs: 2,
                    signer
                });

            const { blobId, blobObject } = await upload().catch(async (error: any) => {
                if (error instanceof RetryableWalrusClientError) {
                    suiJsonRpcClient.walrus.reset();
                    return upload();
                }
                throw new APIError(
                    `Unable to upload to Walrus: ${error?.cause?.toString() ?? error.message}`,
                    STATUS.serverError
                );
            });

            return { blobId, blobObject };
        } catch (error: any) {
            logger.error(error);
            throw new APIError(`Blob upload failed: ${error.message}`, STATUS.serverError);
        }
    }
}