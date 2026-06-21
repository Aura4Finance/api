import { STATUS } from "@/constants/status.constant";
import { CreateCustomerDto, GetCustomersQueryDto } from "@/dto/customer.dto";
import { CustomerRepository } from "@/repositories/customer.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import { Mode } from "@/generated/prisma/client";

@Service()
export class CustomerService {
  constructor(
    private readonly customerRepository: CustomerRepository) { }

  async createCustomer(data: 
    CreateCustomerDto, 
    profileId: string, 
    mode: Mode
  ) {
    const { firstname, lastname, email } = data;
    const existingCustomer =
      await this.customerRepository.findCustomer(email);

    if (existingCustomer) {
      throw new APIError("A customer with this email already exists.", STATUS.conflict);
    }

    const customer = await this.customerRepository.createCustomer(
      firstname,
      lastname,
      email,
      profileId,
      mode
    );

    return {
      message: "Customer created successfully",
      payload: customer,
    };
  }

  async getAllCustomers(
    query: GetCustomersQueryDto, 
    mode: Mode, 
    profileId?: string
  ) {
    let customers;
    if (profileId) {
      customers = await this.customerRepository.getAllCustomers(query, mode, profileId);
    }else {
      customers = await this.customerRepository.getAllCustomers(query, mode);
    }

    return {
      message: "Customers fetched successfully",
      payload: customers,
    };
  }

  async getSingleCustomer(
    customerId: string, 
    mode: Mode, 
    profileId?: string
  ) {
    let customer;
    if(profileId){
       customer = await this.customerRepository.findCustomerbyEmailorId(customerId, mode, profileId);
    }else {
      customer = await this.customerRepository.findCustomerbyEmailorId(customerId, mode);
    }

    if (!customer) {
      throw new APIError("Customer not found.", STATUS.notFound);
    }

    return {
      message: "Customer fetched successfully",
      payload: customer,
    };
  }

  async deleteCustomer(profileId: string, customerId: string) {
    const customerRecords = await this.customerRepository.findAllCustomerRecords(customerId);

    if (customerRecords.length <= 0) {
      throw new APIError("Customer not found.", STATUS.notFound);
    }

    if (customerRecords.length > 1) {
      await this.customerRepository.disconnectCustomerFromUser(
        profileId,
        customerId
      );

      return {
        message: "Customer deleted successfully",
        payload: null,
      };
    }

    await this.customerRepository.deleteCustomer(customerId, profileId);

    return {
      message: "User Deleted successfully",
      payload: null,
    };
  }
}
