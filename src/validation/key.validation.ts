import { RotateApiKeyDto } from "@/dto/api-key.dto";
import Joi from "joi";

export const rotateApiKeySchema = (data: RotateApiKeyDto) => {
    const schema = Joi.object({
        keyId: Joi.string().uuid().required(),
    });

    return schema.validate(data);
};