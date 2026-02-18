import { Service } from "typedi";
import { AuthService } from "../services/auth.service";
import { AuthController } from "@/controllers/auth.controller";
import { Request, Response } from "express";
import { LoginDto, AdminAuthDto, ResetAdminPasswordDto } from "../dto/auth.dto";
import { STATUS } from "../constants/status.constant";
import {
  adminAuthSchemaValidation,
  loginSchemaValidation,
  resetAdminPasswordValidation,
} from "../validation/auth.validation";
import { formatErrorValidation } from "../utils/format-validation-error";
import { RequestAuth } from "@/@types/request";
import { getAllMerchantSchemaValidation } from "@/validation/merchant.validation";
import { getAllMerchantsDto } from "@/dto/merchant.dto";
import { MerchantManagementService } from "@/services/merchant-management.service";
import { queryDashboardSchemaValidation, transactionIdSchemaValidation, transactionModeSchemaValidation, transactionQuerySchemaValidation } from "@/validation/transaction.validation";
import { TransactionService } from "@/services/transaction.service";
import { GetAllTransactionsDto, GetATransactionDto, GetTransactionMetrics } from "@/dto/transaction.dto";
import { getACustomerQueryValidation, getCustomerQueryValidation } from "@/validation/customer.validation";
import { GetACustomerQueryDto, GetCustomersQueryDto } from "@/dto/customer.dto";
import { CustomerService } from "@/services/customer.service";
import { Metrics } from "@/services/metrics.service";
import { UserService } from "@/services/user/user.service";

@Service()
export class AdminController {
  constructor(
    private readonly authController: AuthController,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly merchantManagementService: MerchantManagementService,
    private readonly transactionService: TransactionService,
    private readonly customerService: CustomerService,
    private readonly metrics: Metrics
  ) { }

  async create(req: RequestAuth, res: Response) {
    const { error, value } = adminAuthSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }
    const body: AdminAuthDto = value as AdminAuthDto;

    const { payload, message } = await this.authService.registerAdmin(body);

    return res.status(STATUS.created).json({
      success: true,
      message,
      data: payload,
    });
  }

  async changePassword(req: Request, res: Response) {
    const { error, value } = resetAdminPasswordValidation(req.body);
    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: ResetAdminPasswordDto = value;
    const { payload, message } = await this.authService.changeAdminPassword(
      body
    );

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async signin(req: Request, res: Response) {
    const { error, value } = loginSchemaValidation(req.body);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error),
      });
    }

    const body: LoginDto = value as LoginDto;
    const { payload, message } = await this.authService.adminSignin(body);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload,
    });
  }

  async signout(req: RequestAuth, res: Response) {
    await this.authController.signOut(req, res);
  }

  async resendOtp(req: Request, res: Response) {
    await this.authController.resendOtp(req, res);
  }
  async forgotPassword(req: Request, res: Response) {
    await this.authController.forgotPassword(req, res);
  }

  async resetPassword(req: Request, res: Response) {
    await this.authController.resetPassword(req, res);
  }

  async getProfile(req: RequestAuth, res: Response) {
    const userId = req?.user?.id;
    const profile = await this.userService.getUserById(<string>userId);

    if (!profile) {
      return res.status(STATUS.bad).json({
        success: false,
        message: "Profile not found"
      })
    }
    return res.status(STATUS.ok).json({
      success: true,
      message: "Profile retrieved successfully",
      data: profile,
    });
  }

  async getMerchants(req: Request, res: Response) {
    const { error, value } = getAllMerchantSchemaValidation(req.query);
    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const query: getAllMerchantsDto = value;
    const { message, payload } = await this.merchantManagementService.getAllMerchants(query);
    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    });
  }

  async getMerchant(req: Request, res: Response) {
    const { id } = req.params;
    let merchant: any;
    try {
      merchant = await this.merchantManagementService.getMerchantById(id as string)
    } catch (_) {
      merchant = await this.merchantManagementService.getMerchantByPublicKey(id as string)
    }
    return res.status(STATUS.ok).json({
      success: true,
      message: "Merchant retrieved successfully",
      data: merchant
    });
  }
  async disableMerchant(req: Request, res: Response) {
    const { id } = req.params;
    const response = await this.merchantManagementService.disableMerchant(id as string);
    return res.status(STATUS.ok).json({
      success: true,
      message: response.message
    });
  }
  async enableMerchant(req: Request, res: Response) {
    const { id } = req.params;
    const response = await this.merchantManagementService.enableMerchant(id as string);
    return res.status(STATUS.ok).json({
      success: true,
      message: response.message
    });
  }

  async getAllTransactions(req: Request, res: Response) {
    const { error, value } = transactionQuerySchemaValidation(req.query);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }

    const transactionQuery: GetAllTransactionsDto = value as GetAllTransactionsDto;
    const { message, payload } = await this.transactionService.getAllTransactions(transactionQuery, transactionQuery?.userId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async getTransactionById(req: Request, res: Response) {
    const { error, value } = transactionIdSchemaValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const transactionQuery: GetATransactionDto = value as GetATransactionDto;
    const { message, payload } = await this.transactionService.getTransactionById(transactionQuery.txId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async getAllCustomers(req: Request, res: Response) {
    const { value, error } = getCustomerQueryValidation(req.query as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const customerQuery: GetCustomersQueryDto = value as GetCustomersQueryDto;
    const { message, payload } = await this.customerService.getAllCustomers(customerQuery, customerQuery?.userId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async getCustomerById(req: Request, res: Response) {
    const { value, error } = getACustomerQueryValidation(req.params as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }

    const customerId: GetACustomerQueryDto = value as GetACustomerQueryDto;
    const { message, payload } = await this.customerService.getSingleCustomer(customerId.customerId);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async getTransactionMetrics(req: Request, res: Response) {
    const { error, value } = transactionModeSchemaValidation(req.query as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const query = value as GetTransactionMetrics;
    const { message, payload } = await this.metrics.getTransactionMetrics(query.mode);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async getMerchantMetrics(req: Request, res: Response) {
    const limit = parseInt(req.query.limit as string) || 10;
    const { message, payload } = await this.metrics.getMerchantMetrics(limit);
    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    })
  }

  async getPlatformRevenueMetrics(req: Request, res: Response) {
    const { error, value } = transactionModeSchemaValidation(req.query as any);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }
    const query = value as GetTransactionMetrics
    const { message, payload } = await this.metrics.getPlatformRevenue(query.mode);
    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    });
  }

  async getDashboardMetrics(req: Request, res: Response) {
    const { error, value } = queryDashboardSchemaValidation(req.query);

    if (error) {
      return res.status(STATUS.bad).json({
        success: false,
        message: formatErrorValidation(error)
      })
    }

    const { message, payload } = await this.metrics.getDashboardMetrics(value.mode);

    return res.status(STATUS.ok).json({
      success: true,
      message,
      data: payload
    });
  }

  async healthCheck(_req: Request, res: Response) {
    const healthStatus = await this.metrics.getHealthStatus();

    return res.status(STATUS.ok).json({
      success: true,
      message: "System health retrieved successfully",
      data: healthStatus
    });
  }


  // async getMerchantApiKeys(req: Request, res: Response) {
  //     const { id } = req.params;
  //     const keys = await this.merchantManagementService.getMerchantApiKeys(id as string);
  //     return res.status(STATUS.ok).json({
  //         success: true,
  //         message: "API Keys retrieved successfully",
  //         data: keys
  //     });
  // }
  // async getKeyDetails(req: Request, res: Response) {
  //     const { keyId } = req.params;
  //     const key = await this.merchantManagementService.getKeyDetails(keyId as string);
  //     return res.status(STATUS.ok).json({
  //         success: true,
  //         message: "API Key details retrieved successfully",
  //         data: key
  //     });
  // }
  // async disableApiKey(req: Request, res: Response) {
  //     const { keyId } = req.params;
  //     const response = await this.merchantManagementService.disableApiKey(keyId as string);
  //     return res.status(STATUS.ok).json({
  //         success: true,
  //         message: response.message
  //     });
  // }
  // async enableApiKey(req: Request, res: Response) {
  //     const { keyId } = req.params;
  //     const response = await this.merchantManagementService.enableApiKey(keyId as string);
  //     return res.status(STATUS.ok).json({
  //         success: true,
  //         message: response.message
  //     });
  // }
  // async deleteApiKey(req: Request, res: Response) {
  //     const { keyId } = req.params;
  //     const response = await this.merchantManagementService.deleteApiKey(keyId as string);
  //     return res.status(STATUS.ok).json({
  //         success: true,
  //         message: response.message
  //     });
  // }


}