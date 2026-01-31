import db from "@/config/db-config";
import { CreatePaylinkDto } from "@/dto/paylink.dto";
import { Service } from "typedi";
import { Mode } from "../../generated/prisma";

@Service()
export class PaylinkRepository {
  async createPaylink(profileId: string, data: CreatePaylinkDto, mode: Mode) {
    const result = await db.paylink.create({
      data: {
        title: data.title,
        description: data.description,
        amount: data.amount,
        imageBlobIds: data.imageBlobIds,
        mode,
        profile: {
          connect: {
            id: profileId
          }
        },
      },
    });

    return result;
  }

  async getPaylink(paylinkId: string) {
    const result = await db.paylink.findFirst({
      where: {
        id: paylinkId,
      },
      include: {
        profile: true
      }
    });

    return result;
  }

  async getAllPaylinks(
    profileId: string,
    mode: Mode = "test"
  ){
    const result = await db.paylink.findMany({
      where: {
        profileId,
        mode
      },
    });

    return result;
  }

  async deletepaylink(profileId: string, paylinkId: string) {
    await db.paylink.delete({
      where: {
        profileId,
        id: paylinkId,
      },
    });
  }

  async editPaylink(profileId: string, data: Partial<CreatePaylinkDto>, paylinkId: string) {
    const result = await db.paylink.updateMany({
      where: {
        id: paylinkId,
        profileId
      },
      data: {
        ...data
      }
    });
    return result;
  }
}
