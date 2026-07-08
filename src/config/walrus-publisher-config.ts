import axios from "axios";
import jwt from "jsonwebtoken";
import { createHttpClient } from "@/utils/http-client";
import { Mode } from "@/generated/prisma/enums";


const WALRUS_JWT_SECRET = process.env.JWT_SECRET!;

const generateWalrusPublisherJwt = (mode: Mode) => {
    return jwt.sign(
        {
            svc: "orafi-backend",
            mode,
        },
        WALRUS_JWT_SECRET,
        {
            expiresIn: "5m",
            issuer: "orafi-backend",
        }
    );
};

export const createWalrusPublisherClient = (mode: Mode) => {
    const publisher = axios.create({
        baseURL: mode === "live"
            ? "https://walrus-mainnet-publisher.orafi.app"
            : "https://walrus-testnet-publisher.orafi.app",
        headers: {
            "Content-Type": "application/octet-stream",

        },
        timeout: 20_000,
        responseType: "json",
    });

    publisher.interceptors.request.use((config) => {
        config.headers.Authorization = `Bearer ${generateWalrusPublisherJwt(mode)}`;
        return config;
    });

    return createHttpClient(publisher, {
        timeoutMs: 20_000,
    });
};
