import axios from "axios";

const coinMarketClient = axios.create({
    baseURL: "https://pro-api.coinmarketcap.com/v1",
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY!,
      },
    withCredentials: true
});

export default coinMarketClient;  