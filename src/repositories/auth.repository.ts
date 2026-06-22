import { Service } from "typedi";
import db from "@/config/db-config";

@Service()
export class AuthRepository {
  async registerOtp(userId: string, otp: string) {
    const existingOtp = await db.oTP.findFirst({
      where: {
        userId,
      },
    });

    if (existingOtp) {
      await db.oTP.delete({
        where: {
          id: existingOtp.id,
        },
      });
    }

    const result = await db.oTP.create({
      data: {
        userId,
        secret: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      select: {
        secret: true,
      },
    });

    return result;
  }

  async findOtpByEmail(email: string) {
    const result = await db.oTP.findFirst({
      where: {
        user: {
          email,
        }
      },
      select: {
        id: true,
        secret: true,
        expiresAt: true,
      },
    });

    return result;
  }

  async findDtoByCode(secret: string){
    const result = await db.oTP.findFirst({
      where: {
        secret
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true
      }
    })

    return result;
  }

  async deleteOtp(otpId: string) {
    await db.oTP.delete({
      where: {
        id: otpId,
      },
    });
  }
}
