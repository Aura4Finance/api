export interface CreatePaylinkDto {
  title: string;
  description: string;
  amount: number;
  currency: string;
  images: Image[]
}

export interface Image {
  blobId: string;
  blobObjectId: string;
}

export interface PaylinkReferenceDto {
  paylinkId: string;
}

