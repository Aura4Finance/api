export interface CreateAccountDto {
    accountNumber: string,
    bankCode: string,
    bankName: string,
    isPrimary: boolean
}

export interface UpdateAccountDto {
    isPrimary: boolean
}