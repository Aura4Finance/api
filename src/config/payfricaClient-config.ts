import axios from "axios";
import { createHttpClient } from "@/utils/http-client";
import { getLimiter } from "@/utils/rate-limiter";

const payfricaAxios = axios.create({
    baseURL: "https://backend.payfrica.xyz/api/v1/partners",
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-partner-api-key": process.env.PAYFRICA_PARTNER_API_KEY,
        "x-partner-api-secret": process.env.PAYFRICA_PARTNER_API_SECRET,
    },
    withCredentials: true,
});

const payfricaClient = createHttpClient(payfricaAxios, {
    timeoutMs: 8000,
    limiter: getLimiter("payfrica"),
});

export default payfricaClient;