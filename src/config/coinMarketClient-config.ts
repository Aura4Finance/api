import axios from "axios";
import { createHttpClient } from "@/utils/http-client";
import { getLimiter } from "@/utils/rate-limiter";

const coinMarketAxios = axios.create({
  baseURL: "https://pro-api.coinmarketcap.com/v1",
  headers: {
    Accept: "application/json",
    "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY!,
  },
  withCredentials: true,
});

const coinMarketClient = createHttpClient(coinMarketAxios, {
  timeoutMs: 8000,
  limiter: getLimiter("coinmarketcap"),
});

export default coinMarketClient;