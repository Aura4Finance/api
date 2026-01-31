import { getFullnodeUrl } from "@mysten/sui/client";
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

    async uploadImageToWalrus(imageBuffer: Uint8Array, userId: string) {
        const network =
            (await this.userRepository.findUserById(userId))?.businessProfile?.isLive
                ? "mainnet"
                : "testnet";

                
        const suiJsonRpcClient = new SuiJsonRpcClient({
            url: getFullnodeUrl(network),
            network,
        }).$extend(
            walrus({
                uploadRelay: {
                    host: network ===  "testnet" ? "https://upload-relay.testnet.walrus.space" : "https://upload-relay.walrus.space",
                    sendTip: {
                        max: 1_000,
                    },
                },
            })
        );
        const upload = () =>
            suiJsonRpcClient.walrus.writeBlob({
                blob: imageBuffer,
                deletable: true,
                epochs: 2,
                signer: Ed25519Keypair.fromSecretKey(this.walletSerice.admin_secret_key),
            });
        try {
            const { blobId, blobObject } = await upload().catch(async (error: any) => {
                if (error instanceof RetryableWalrusClientError) {
                    suiJsonRpcClient.walrus.reset();
                    return upload();
                }
                throw new APIError(`Unable to upload to Walrus: ${error?.cause?.toString() ?? error.message}`, STATUS.serverError);
            });

            return { blobId, blobObject };
        } catch (error: any) {
            logger.error(error)
            throw new APIError(`Blob upload failed: ${error.message}`, STATUS.serverError);
        }
    }
}