export interface CreatePaylinkDto {
  title: string;
  description: string;
  amount: number;
  currency: string;
  imageBlobIds: string[];
}

export interface PaylinkReferenceDto {
  paylinkId: string;
}

