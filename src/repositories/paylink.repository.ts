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
        
        currency: data.currency,
        mode,
        profile: {
          connect: {
            id: profileId
          }
        },
        images: {
          create: data.images.map((image) => ({
            blobId: image.blobId,
            blobObjectId: image.blobObjectId,
          })),
        },
      },
      include: {
        images: true,
      },
    });

    return result;
  }

  async getPaylink(paylinkId: string) {
    const result = await db.paylink.findUnique({
      where: {
        id: paylinkId,
      },
      include: {
        profile: true,
        images: true,
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
      include: {
        images: true,
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
    const { images, ...paylinkData } = data;

    const result = await db.paylink.update({
      where: {
        id: paylinkId,
        profileId
      },
      data: {
        ...paylinkData,
        ...(images && {
          images: {
            create: images.map((image) => ({
              blobId: image.blobId,
              blobObjectId: image.blobObjectId,
            })),
          },
        }),
      },
      include: {
        images: true,
      },
    });
    return result;
  }

  async createImages(paylinkId: string, images: any[]) {
    const result = await db.images.createMany({
      data: images.map((image) => ({
        blobId: image.blobId,
        blobObjectId: image.blobObjectId,
        paylinkId,
      })),
    });

    return result;
  }

  async getImageById(imageId: string) {
    const result = await db.images.findUnique({
      where: {
        id: imageId,
      },
    });

    return result;
  }

  async deleteImage(imageId: string) {
    await db.images.delete({
      where: {
        id: imageId,
      },
    });
  }
}
