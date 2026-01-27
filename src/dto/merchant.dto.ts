export interface updateMerchantProfileDto {
        firstName: string,
        lastName: string,
        businessName: string,
        businessSector: string,
        country: string,
        websiteLink: string
}

export interface getAllMerchantsDto {
        country?: string,
        businessSector?: string,
        businessName?: string,
        onboarded?: boolean,
        disabled?: boolean,
        search?: string,
        countryList?: string,
        sortBy?: 'businessName' | 'createdAt',
        sortOrder?: 'asc',
        limit?:  20,
        cursor?: string
}