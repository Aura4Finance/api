import { Service } from "typedi";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";
import { getAllMerchantsDto } from "@/dto/merchant.dto";

@Service()
export class MerchantManagementService {
    constructor(private readonly userRepository: UserRepository) { }

    async getAllMerchants(query: getAllMerchantsDto) {
        const {merchants, hasNextPage, nextCursor} = await this.userRepository.findAllMerchants(query);
        return {
            message: "Merchants retrived successfully!",
            payload: {
                merchants,
                hasNextPage,
                nextCursor
            }
        };
    }

    async getMerchantById(userId: string) {
        const merchant = await this.userRepository.findUserById(userId);
        if (!merchant || merchant.role !== "MERCHANT") {
            throw new APIError("Merchant not found", STATUS.notFound);
        }
        return merchant;
    }

    async getMerchantByEmail(userEmail: string) {
        const merchant = await this.userRepository.findUserByEmail(userEmail);
        if (!merchant || merchant.role !== "MERCHANT") {
            throw new APIError("Merchant not found", STATUS.notFound);
        }
        return merchant;
    }

    async getMerchantByPublicKey(walletAddress: string){
        const merchant = await this.userRepository.findUserByPublicKey(walletAddress);
        return merchant;
    }


    async disableMerchant(id: string) {
        const merchant = await this.userRepository.findUserById(id);
        if (!merchant || merchant.role !== "MERCHANT") {
            throw new APIError("Merchant not found", STATUS.notFound);
        }
        await this.userRepository.updateUserStatus(merchant.id, true);
        return { 
            message: "Merchant disabled successfully" 
        };
    }
    async enableMerchant(id: string) {
        const merchant = await this.userRepository.findUserById(id);
        if (!merchant || merchant.role !== "MERCHANT") {
            throw new APIError("Merchant not found", STATUS.notFound);
        }
        await this.userRepository.updateUserStatus(merchant.id, false);
        return { 
            message: "Merchant enabled successfully" 
        };
    }
    // async getMerchantApiKeys(id: string) {
    //     const merchant = await this.userRepository.findUserById(id);
    //     if (!merchant || merchant.role !== "MERCHANT") {
    //         throw new APIError("Merchant not found", STATUS.notFound);
    //     }
    //     const keys = await this.apiKeyRepository.getApiKeys(id);
    //     return keys;
    // }
    // async getKeyDetails(keyId: string) {
    //     const key = await this.apiKeyRepository.getApiKeyDetails(keyId);
    //     return key;
    // }
    // async disableApiKey(keyId: string) {
    //     await this.apiKeyRepository.deactivateApiKey(keyId);
    //     return {
    //         message: "API Key disabled successfully"
    //     }
    // }
    // async enableApiKey(keyId: string) {
    //     await this.apiKeyRepository.activateApiKey(keyId);
    //     return {
    //         message: "API Key enabled successfully"
    //     }
    // }   
    // async deleteApiKey(keyId: string) {
    //     await this.apiKeyRepository.deleteApiKey(keyId);
    //     return {
    //         message: "API Key deleted successfully"
    //     }
    // }
    // async regenerateApiKey(keyId: string) {
    //     const key = await this.apiKeyRepository.getApiKeyDetails(keyId);
    //     if (!key) {
    //         throw new APIError("API Key not found", STATUS.notFound);
    //     }
    //     const newKey = await this.apiKeyRepository.generateApiKey("", key.profileId);
    //     await this.apiKeyRepository.deactivateApiKey(keyId);
    //     return { 
    //         message: "API Key regenerated successfully", 
    //         newKey 
    //     };
    // }
    

}