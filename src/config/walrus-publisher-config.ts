import axios from "axios";
import { createHttpClient } from "@/utils/http-client";
import { Mode } from "@/generated/prisma/enums";

export const createWalrusPublisherClient = (mode: Mode) => {
    const publisher = axios.create({
        baseURL: mode === "live"
            ? "http://mainnet-publisher"
            : "http://testnet-publisher",
        headers: {
            "Content-Type": "application/octet-stream",
        },
        timeout: 20_000,
        responseType: "json",
    });

    return createHttpClient(publisher, {
        timeoutMs: 20_000,
    });
};