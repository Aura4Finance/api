import Joi from "joi";

export const createWaitlistValidation = (data: { email: string }) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
  });
  return schema.validate(data); 
}