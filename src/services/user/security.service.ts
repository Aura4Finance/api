import { Service } from "typedi";
import argon from "argon2";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

@Service()
export class SecurityService {
  constructor(
    private readonly userRepository: UserRepository
  ) {}

  async verifyPassword(userId: string, password: string) {
    const user = await this.userRepository.findUserById(userId);

    const passwordMatch = await argon.verify(user?.password!, password);

    if (!passwordMatch) {
      throw new APIError("Invalid password", STATUS.bad);
    }

    return {
      message: "Old password verified successfully",
      payload: null,
    };
  }

  async completePasswordChange(userId: string, password: string) {
    const hashedPassword = await argon.hash(password);

    await this.userRepository.changePassword(userId, hashedPassword);

    return {
      message: "Password changed successfully",
      payload: null,
    };
  }


}
