import db from "@/config/db-config";
import { CreatePaylinkDto } from "@/dto/paylink.dto";
import { Service } from "typedi";
import { Mode } from "@/generated/prisma/client";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

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
  ) {
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

  async deletepaylink(profileId: string, paylinkId: string, mode: Mode) {
    // fetch images before deleting so we have blobObjectIds for Walrus
    const paylink = await db.paylink.findFirst({
      where: { 
        id: paylinkId,
        profileId,
        mode
    },
      include: { images: true },
    });

    if (!paylink) throw new APIError("Paylink not found", STATUS.notFound);

    return paylink;
  }

  async hardDeletePaylink(profileId: string, paylinkId: string) {
    await db.paylink.delete({
      where: { id: paylinkId, profileId },
    });
  }

  async editPaylink(profileId: string, data: Partial<CreatePaylinkDto>, paylinkId: string, mode: Mode) {
    const { images, ...paylinkData } = data;

    const result = await db.paylink.update({
      where: {
        id: paylinkId,
        profileId,
        mode
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

  async getImageById(imageId: string, profileId: string) {
    const result = await db.images.findUnique({
      where: {
        id: imageId,
        paylink: {
          profileId
        }
      },
    });

    return result;
  }

  async deleteImage(imageId: string, profileId: string) {
    await db.images.delete({
      where: {
        id: imageId,
        paylink: {
          profileId
        }
      },
    });
  }
}
