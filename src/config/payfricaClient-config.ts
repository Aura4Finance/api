import axios from "axios";

const payfricaClient = axios.create({
    baseURL: "https://backend.payfrica.xyz/api/v1/partners",
    headers: {
        "x-partner-api-key": process.env.PAYFRICA_PARTNER_API_KEY,
        "x-partner-api-secret": process.env.PAYFRICA_PARTNER_API_SECRET,
        },
    withCredentials: true
});

export default payfricaClient;  