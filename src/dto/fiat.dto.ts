export interface CreateAccountDto {
    accountNumber: string,
    bankCode: string,
    bankName: string,
    isPrimary: boolean
}

export interface UpdateAccountDto {
    isPrimary: boolean
}

export interface InitiatePayoutDto {
    amount: number,
    accountId?: string,
    accountIdentifier?: string,
    bankCode?: string,
    accountName?: string
}