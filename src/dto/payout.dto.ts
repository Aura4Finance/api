export interface CryptoPayOutDto {
    walletAddress?: string;
    bytes?: string,
    signature?: string,
    cryptoSettlementAccountId?: string,
    save?: boolean;
    amount: number
}

export interface RetryCryptoPayoutDto {
    transactionId: string
}

export interface PayoutQueryDto {
    status?: string;
    walletAddress?: string;
    method?: string;
    txDigest?: string;
    minAmount?: number;
    maxAmount?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    cursor?: string;
    limit: 20;
}