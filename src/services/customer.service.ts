import { STATUS } from "@/constants/status.constant";
import { CreateCustomerDto, GetCustomersQueryDto } from "@/dto/customer.dto";
import { CustomerRepository } from "@/repositories/customer.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { APIError } from "@/utils/error-handler";
import { Service } from "typedi";
import { Mode } from "../../generated/prisma";

@Service()
export class CustomerService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly customerRepository: CustomerRepository) { }

  async createCustomer(data: 
    CreateCustomerDto, 
    userId: string, 
    mode: Mode
  ) {
    const { firstname, lastname, email } = data;

    const profileId = (await this.userRepository.findUserById(userId))?.businessProfile?.id;
    const existingCustomer =
      await this.customerRepository.findCustomer(email);

    if (existingCustomer) {
      throw new APIError("Customer already exists", STATUS.conflict);
    }

    const customer = await this.customerRepository.createCustomer(
      firstname,
      lastname,
      email,
      profileId as string,
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
    userId?: string
  ) {
    let customers;
    if (userId) {
      const profile = await this.userRepository.findUserById(userId)
      if(!profile){
        throw new APIError("Invalid user ID!", STATUS.bad);
      }
      customers = await this.customerRepository.getAllCustomers(query, mode, profile?.businessProfile?.id);
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
    userId?: string
  ) {
    let customer;
    if(userId){
      const profile = await this.userRepository.findUserById(userId);
      if(!profile){
        throw new APIError("Invalid user ID!", STATUS.bad);
      }
       customer = await this.customerRepository.findCustomerbyEmailorId(customerId, mode, profile.businessProfile?.id);
    }else {
      customer = await this.customerRepository.findCustomerbyEmailorId(customerId, mode);
    }

    if (!customer) {
      throw new APIError("Customer not found", STATUS.notFound);
    }

    return {
      message: "Customer fetched successfully",
      payload: customer,
    };
  }

  async deleteCustomer(userId: string, customerId: string) {
    const profileId = await this.userRepository
      .findUserById(userId)
      .then((user) => user?.businessProfile?.id);
    const customerRecords =
      await this.customerRepository.findAllCustomerRecords(customerId);

    if (customerRecords.length <= 0) {
      throw new APIError("Customer not found", STATUS.notFound);
    }

    if (customerRecords.length > 1) {
      await this.customerRepository.disconnectCustomerFromUser(
        profileId as string,
        customerId
      );

      return {
        message: "Customer deleted successfully",
        payload: null,
      };
    }

    await this.customerRepository.deleteCustomer(customerId, userId);

    return {
      message: "User Deleted successfully",
      payload: null,
    };
  }
}
