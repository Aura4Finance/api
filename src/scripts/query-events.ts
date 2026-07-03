import { getSmartContractId } from "@/constants/networks.constant";
import { Mode } from "@/generated/prisma/client";
import { TatumRpcClient } from "@/services/tatum.service";

const mode = Mode.test
const packageId = getSmartContractId(mode == "test" ? "testnet" : "mainnet")!;
const MoveEventType = `${packageId}::main::PaymentProcessed`;
const tatumRpcClient = new TatumRpcClient();

const result = await tatumRpcClient.queryEvents({
    filter: { MoveEventType },
    limit: 50,
    mode,
    descending: false,
});

const events = result.data.map((event) => ({
    txDigest: event.id.txDigest,
    eventSeq: event.id.eventSeq,
    timestampMs: event.timestampMs,
    sender: event.sender,
    parsedJson: event.parsedJson,
}));

console.log("Queried Events:", events);