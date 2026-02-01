export interface CreatePaylinkDto {
  title: string;
  description: string;
  amount: number;
  imageBlobIds: string[];
}

export interface PaylinkReferenceDto {
  paylinkId: string;
}

