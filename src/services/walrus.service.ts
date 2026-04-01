import { getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { walrus, RetryableWalrusClientError } from "@mysten/walrus";
import { Service } from "typedi";
import { WalletService } from "./wallet.service";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { UserRepository } from "@/repositories/user/user.repository";
import logger from "@/utils/logger";


@Service()
export class WalrusService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly walletSerice: WalletService
    ) { }

    private async getNetwork(userId: string): Promise<'mainnet' | 'testnet'> {
        const isLive = (await this.userRepository.findUserById(userId))?.businessProfile?.isLive;
        return isLive ? "mainnet" : "testnet";
    }

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
                    sendTip: { max: 1_000 },
                },
            })
        );
    }

    private getSigner() {
        return Ed25519Keypair.fromSecretKey(this.walletSerice.admin_secret_key);
    }

    async deleteImageFromWalrus(blobObjectId: string, userId: string) {
        try {
            const network = await this.getNetwork(userId);
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

    async uploadImageToWalrus(imageBuffer: Uint8Array, userId: string) {
        try {
            const network = await this.getNetwork(userId);
            const suiJsonRpcClient = this.getWalrusClient(network);
            const signer = this.getSigner();

            const upload = () =>
                suiJsonRpcClient.walrus.writeBlob({
                    blob: imageBuffer,
                    deletable: true,
                    epochs: 2,
                    signer,
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