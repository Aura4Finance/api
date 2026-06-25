import axios from "axios";
import { createHttpClient } from "@/utils/http-client";
import { getLimiter } from "@/utils/rate-limiter";
import { Mode } from "@/generated/prisma/enums";

export const createTatumClient = (mode: Mode) => {
    const tatum = axios.create({
        baseURL: mode === "test" ? "https://sui-testnet.gateway.tatum.io" : "https://sui-mainnet.gateway.tatum.io",
        headers: {
            "content-Type": "application/json",
            Accept: "application/json",
            "x-api-key": process.env.TATUM_KEY,

        }
    });

    const tatumRpc = createHttpClient(tatum, {
        timeoutMs: 8000,
        limiter: getLimiter("payfrica"),
    });
    return tatumRpc;
}