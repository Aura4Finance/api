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

export interface PaylinkAIDescriptionDto {
  mode: "Compact" | "Balanced" | "Detailed" | "Persuasive";
  topic?: string;
  audience?: string;
  tone?: string;
  highlights?: string;
  callToAction?: string;
  roughNotes?: string;
}

export interface PaylinkAIDescriptionResponseDto {
  content: string;
}

