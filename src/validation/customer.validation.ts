import { CreateCustomerDto, GetCustomersQueryDto, GetACustomerQueryDto } from "@/dto/customer.dto";
import Joi from "joi";

export const createCustomerValidation = (data: CreateCustomerDto) => {
  const schema = Joi.object({
    firstname: Joi.string().min(2).required(),
    lastname: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
  });

  return schema.validate(data);
};

export const getACustomerQueryValidation = (data: GetACustomerQueryDto) => {
  const schema = Joi.object<GetACustomerQueryDto>({
    customerId: Joi.string().required()
  })

  return schema.validate(data);
}

export const getCustomerQueryValidation = (data: GetCustomersQueryDto) => {
  const schema = Joi.object<GetCustomersQueryDto>({
    amountSpent: Joi.string()
      .valid(
        "BELOW10USDT",
        "FROM10TO30USDT",
        "FROM30TO100USDT",
        "FROM100TO200USDT",
        "FROM200TO500USDT",
        "ABOVE500USDT"
      ),
    mode: Joi.string().valid("live", "test").optional(),
    userId: Joi.string().optional(),
    limit: Joi.number().integer().positive().default(20),
    cursor: Joi.string(),
  });

  return schema.validate(data);
}
