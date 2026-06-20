import { 
    Token,
    TransactionStatus, 
    TransactionType, 
    PaymentMethod,
    Mode,
    Network
} from "@generated/prisma";

type IntervalPreset = 
    | "today"
    | "yesterday"
    | "last7days"
    | "last30days"
    | "thisMonth"
    | "lastMonth"
    | "thisYear"

export type TransactionDateFilter = 
|  {
    type: "preset",
    interval: IntervalPreset
}
| {
    type: "range",
    startDate: string,
    endDate: string
}

export interface GetAllTransactionsDto {
    type: TransactionType,
    status: TransactionStatus,
    token: Token,
    date: TransactionDateFilter,
    customerId: string,
    subscriptionId: string,
    paymentLinkId: string,
    paymentMethod: PaymentMethod,
    currency: String,
    network: Network,
    userId?: string,
    mode?: Mode,
    limit?: number,
    cursor?: string
}

export interface GetATransactionDto {
    txId: string
}

export interface GetTransactionMetrics {
    mode: Mode,
    status: TransactionStatus
}   