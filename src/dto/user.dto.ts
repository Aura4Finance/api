export interface OnboardUserDto {
  businessName: string;
  businessSector: string;
  country: string;
  websiteLink?: string;
}

export interface ChangeEmailDto {
  email: string;
}

export interface VerifyEmailChangeDto {
  email: string;
  otp: string;
}
