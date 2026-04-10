import { RotateApiKeyDto } from "@/dto/api-key.dto";
import Joi from "joi";

export const rotateApiKeySchema = (data: RotateApiKeyDto) => {
    const schema = Joi.object({
        keyId: Joi.string().required().messages({
          'any.required': 'API Key ID is required for rotation',
        }),
    });

    return schema.validate(data);
};