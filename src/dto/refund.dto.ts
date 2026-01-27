export interface RefundDto {
    originalTxId: string;
    to: string;
    reason?: string;
}

export interface RetryRefundDto {
    transactionId: string
}

export interface RefundQueryDto {
    status?: string;
    walletAddress?: string;
    customerId?: string;
    txDigest?: string;
    minAmount?: number;
    maxAmount?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    cursor?: string;
    limit: 20;
}