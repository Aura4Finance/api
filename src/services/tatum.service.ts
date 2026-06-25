import { Service } from "typedi";
import { Mode } from "@/generated/prisma/enums";
import { createTatumClient } from "@/config/tatum-config";
import { STATUS } from "@/constants/status.constant";
import { APIError } from "@/utils/error-handler";

type CoinsResult = {
    data: {
        coinType: string;
        coinObjectId: string;
        version: string;
        digest: string;
        balance: string;
        previousTransaction: string;
    }[];
    nextCursor: string;
    hasNextPage: boolean;
};

type BalanceResult = {
    coinType: string;
    totalBalance: string;
    coinObjectCount: number;
    lockedBalance: Record<string, string>;
};

type ObjectResult =
    | {
        error: null;
        objectId: string;
        version: string;
        digest: string;
        type: string;
        owner: unknown;
        content: {
            dataType: "moveObject";
            type: string;
            hasPublicTransfer: boolean;
            fields: Record<string, unknown>;
        } | null;
    }
    | {
        error: {
            code: "deleted" | "notExists" | "dynamicFieldNotFound" | "displayError";
            object_id: string;
            version: number;
            digest: string;
        };
    };

type EventResult = {
    data: {
        id: { txDigest: string; eventSeq: string };
        packageId: string;
        transactionModule: string;
        sender: string;
        type: string;
        parsedJson: Record<string, unknown>;
        bcs: string;
        timestampMs: string;
    }[];
    nextCursor: { txDigest: string; eventSeq: string } | null;
    hasNextPage: boolean;
};

type EventFilter =
    | { Transaction: string }
    | { MoveModule: { package: string; module: string } }
    | { MoveEventType: string }
    | { Sender: string }
    | { TimeRange: { startTime: string; endTime: string } };

type MethodResponseMap = {
    suix_getCoins: CoinsResult;
    suix_getBalance: BalanceResult;
    sui_getObject: ObjectResult;
    suix_queryEvents: EventResult;
};

type TatumRpcResponse<T> = {
    id: number;
    jsonrpc: string;
    result: T;
};

type TatumRequestMethods = keyof MethodResponseMap;

type TatumRequest = {
    address?: string;
    objectId?: string;
    cursor?: string;
    mode: Mode;
    coinType?: string;
};

type EventRequest = TatumRequest & {
    filter: EventFilter;
    cursor?: { txDigest: string; eventSeq: string } | null;
    limit?: number;
    descending?: boolean;
};

@Service()
export class TatumRpcClient {

    private async sendRequest<M extends TatumRequestMethods>(
        req: TatumRequest | EventRequest,
        method: M,
    ): Promise<MethodResponseMap[M]> {
        const client = createTatumClient(req.mode);

        let params: unknown[];

        switch (method) {
            case "suix_getCoins":
                if (!req.address || !req.coinType)
                    throw new APIError("address and coinType required for suix_getCoins", STATUS.bad);
                params = req.cursor ? [req.address, req.coinType, req.cursor] : [req.address, req.coinType];
                break;

            case "suix_getBalance":
                if (!req.address)
                    throw new APIError("address required for suix_getBalance", STATUS.bad);
                params = [req.address, req.coinType];
                break;

            case "sui_getObject":
                if (!req.objectId)
                    throw new APIError("objectId required for suix_getObject", STATUS.bad);
                params = [req.objectId];
                break;

            case "suix_queryEvents": {
                const evReq = req as EventRequest;
                if (!evReq.filter)
                    throw new APIError("filter required for suix_queryEvents", STATUS.bad);
                params = [
                    evReq.filter,
                    evReq.cursor ?? null,
                    evReq.limit ?? 50,
                    evReq.descending ?? false,
                ];
                break;
            }

            default:
                throw new APIError(`Unknown method: ${method}`, STATUS.bad);
        }

        const response = await client.post<TatumRpcResponse<MethodResponseMap[M]>>("/", {
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
        });

        return response.data.result;
    }

    async listCoins(req: TatumRequest): Promise<CoinsResult> {
        return this.sendRequest(req, "suix_getCoins");
    }

    async getBalance(req: TatumRequest): Promise<BalanceResult> {
        return this.sendRequest(req, "suix_getBalance");
    }

    async getObject(req: TatumRequest): Promise<ObjectResult> {
        return this.sendRequest(req, "sui_getObject");
    }

    async queryEvents(req: EventRequest): Promise<EventResult> {
        return this.sendRequest(req, "suix_queryEvents");
    }

    async getObjects(req: { objectIds: string[]; mode: Mode }): Promise<ObjectResult[]> {
        return Promise.all(
            req.objectIds.map(objectId =>
                this.getObject({ objectId, mode: req.mode })
            )
        );
    }
}