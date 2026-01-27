export interface CreateAccountDto {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AdminAuthDto {
  firstname: string,
  lastname: string,
  email: string;
}

export interface ResetAdminPasswordDto {
  email: string;
  oldPassword: string;
  newPassword: string;
}

export interface OTPDto {
  email: string;
  otp: string;
}

export interface ResendOtpDto {
  email: string;
}

export interface ResetPasswordDto {
  otp: string;
  email: string;
  password: string;
}

export interface AuthCodeDto {
  otp: string,
  type: "orafi" | "google";
}
