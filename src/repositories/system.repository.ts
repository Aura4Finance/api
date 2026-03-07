import db from "@/config/db-config";

export class SystemRepository {
    async findConfig(key: string) {
        return db.systemConfig.findUnique({
            where: { key }
        });
    }

    async createConfig(data: {
        key: string;
        encryptedSeedPhrase: string;
        iv: string;
        authTag: string;
    }) {
        return db.systemConfig.create({ data });
    }

    async getConfigValue(key: string) {
        const config = await this.findConfig(key);
        return config?.encryptedSeedPhrase;
    }

    async setConfigValue(key: string, value: string) {
        const config = await db.systemConfig.upsert({
            where: { key },
            update: { encryptedSeedPhrase: value },
            create: { key, encryptedSeedPhrase: value, iv: "", authTag: "" }
        });
        return config;
    }

    async getNextWalletIndex() {
        const counter = await db.walletCounter.upsert({
            where: { id: 1 },
            update: { currentIndex: { increment: 1 } },
            create: { id: 1, currentIndex: 1 }
        });
        return counter.currentIndex;
    }
}

export const systemRepository = new SystemRepository();