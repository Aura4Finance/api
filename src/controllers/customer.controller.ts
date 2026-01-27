import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { CreateCustomerDto, GetACustomerQueryDto, GetCustomersQueryDto } from "@/dto/customer.dto";
import { CustomerService } from "@/services/customer.service";
import { APIError } from "@/utils/error-handler";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { createCustomerValidation, getACustomerQueryValidation, getCustomerQueryValidation } from "@/validation/customer.validation";
import { Response } from "express";
import { Service } from "typedi";

@Service()
export class CustomerController {
  constructor(private readonly cusomerService: CustomerService) { }

  async createCustomer(req: RequestAuth, res: Response) {
    const { error, value } = createCustomerValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: CreateCustomerDto = value as CreateCustomerDto;
    const userId = req.user?.id as string;

    const { payload, message } = await this.cusomerService.createCustomer(
      body,
      userId
    );

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getCustomers(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const { value, error } = getCustomerQueryValidation(req.query as any);
    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const query: GetCustomersQueryDto = value as GetCustomersQueryDto;
    const { message, payload } = await this.cusomerService.getAllCustomers(query, userId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async getCustomer(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const {error , value } = getACustomerQueryValidation(req.params as any);

    if(error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const customerId: GetACustomerQueryDto = value as GetACustomerQueryDto;

    if (!customerId) {
      throw new APIError("Invalid request", STATUS.bad);
    }

    const { message, payload } = await this.cusomerService.getSingleCustomer(customerId.customerId, userId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async deleteCustomer(req: RequestAuth, res: Response) {
    const userId = req.user?.id as string;
    const {error , value } = getACustomerQueryValidation(req.params as any);

    if(error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const customerId: GetACustomerQueryDto = value as GetACustomerQueryDto;

    if (!customerId) {
      throw new APIError("Invalid request", STATUS.bad);
    }
    
    const { message, payload } = await this.cusomerService.deleteCustomer(
      userId,
      customerId.customerId
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }
}
