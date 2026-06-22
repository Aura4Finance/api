import { getTokenPrice } from "@7kprotocol/sdk-ts";
import { getCoinType } from "@/constants/tokens.constants";

async function checkPrice(price: number = 0.01) {
    const rate = await getTokenPrice(getCoinType("SUI", "testnet")!);
    console.log(rate);
    console.log("SUI Price:", price / rate);
}

checkPrice(1)
