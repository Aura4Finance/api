import { AddSettlementAccountDto } from "@/dto/settlement.dto";
import Joi from "joi";

export const addSettlementAccountSchemaValidation = (
  data: AddSettlementAccountDto
) => {
  const schema = Joi.object({
    walletAddress: Joi.string().required(),
    bytes: Joi.string().required(),
    signature: Joi.string().required()
  });

  return schema.validate(data);
};
