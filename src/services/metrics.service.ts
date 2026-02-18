import { TransactionRepository } from "@/repositories/transaction.repository";
import { UserRepository } from "@/repositories/user/user.repository";
import { Service } from "typedi";
import db from "@/config/db-config";
import os from "os";
import { Mode } from "../../generated/prisma";
import { CustomerRepository } from "@/repositories/customer.repository";

@Service()
export class Metrics {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly userRepository: UserRepository,
    private readonly customerRepository: CustomerRepository
  ) {}

  async getTransactionMetrics(mode: Mode = Mode.live) {
    const transactionMetrics =
      await this.transactionRepository.getTransactionMetrics({ mode });

    return {
      message: "Transaction metrics retrieved successfully",
      payload: transactionMetrics,
    };
  }

  async getTransactionCountByStatus(mode: Mode = Mode.live) {
    const countByStatus =
      await this.transactionRepository.getTransactionCountByStatus(mode);

      return {
        message: "Transaction count by status retrieved successfully",
        payload: countByStatus,
      }
  }

  async getMerchantMetrics(limit: number = 10) {
    const { total, live, onboarded } =
      await this.userRepository.merchantStats();
    const leaderboard = await this.userRepository.getTopMerchants(limit);
    return {
      message: "Merchant metrics retrieved successfully",
      payload: {
        total,
        live,
        onboarded,
        leaderboard,
      },
    };
  }

  async getHealthStatus() {
    const start = Date.now();

    type ServiceStatus = "operational" | "degraded" | "down";

    const services: Array<{
      name: string;
      status: ServiceStatus;
      responseTime: number;
      message?: string | undefined;
    }> = [];

    // 1. Database check
    try {
      const dbStart = Date.now();
      await db.$runCommandRaw({ ping: 1 });
      const dbLatency = Date.now() - dbStart;

      let status: ServiceStatus =
        dbLatency < 100 ? "operational" : dbLatency < 500 ? "degraded" : "down";

      services.push({
        name: "Database",
        status,
        responseTime: dbLatency,
        message: status === "degraded" ? "High query latency" : undefined,
      });
    } catch {
      services.push({
        name: "Database",
        status: "down",
        responseTime: 0,
        message: "Database unreachable",
      });
    }

    // 2. Core API (self-check)
    const apiLatency = Date.now() - start;
    const apiStatus: ServiceStatus =
      apiLatency < 100 ? "operational" : apiLatency < 500 ? "degraded" : "down";

    services.push({
      name: "Core API",
      status: apiStatus,
      responseTime: apiLatency,
      message: apiStatus === "degraded" ? "Slow request handling" : undefined,
    });

    // 3. Sui Blockchain RPC check
    try {
      const rpcStart = Date.now();
      const rpcResponse = await fetch("https://fullnode.mainnet.sui.io:443", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getLatestCheckpointSequenceNumber",
          params: [],
        }),
      });

      const rpcLatency = Date.now() - rpcStart;

      let status: ServiceStatus;
      if (!rpcResponse.ok) {
        status = "down";
      } else if (rpcLatency < 300) {
        status = "operational";
      } else if (rpcLatency < 1000) {
        status = "degraded";
      } else {
        status = "down";
      }

      services.push({
        name: "Blockchain RPC (Sui)",
        status,
        responseTime: rpcLatency,
        message: status === "degraded" ? "High RPC latency" : undefined,
      });
    } catch {
      services.push({
        name: "Blockchain RPC (Sui)",
        status: "down",
        responseTime: 0,
        message: "RPC unreachable",
      });
    }

    // 4. Payment Processor (OraFi API)
    try {
      const ppStart = Date.now();
      const ppResponse = await fetch("https://api.orafi.app", {
        method: "GET",
      });
      const ppLatency = Date.now() - ppStart;

      let status: ServiceStatus;
      if (!ppResponse.ok) {
        status = "down";
      } else if (ppLatency < 200) {
        status = "operational";
      } else if (ppLatency < 500) {
        status = "degraded";
      } else {
        status = "degraded"; // slow but alive
      }

      services.push({
        name: "Payment Processor",
        status,
        responseTime: ppLatency,
        message:
          status === "degraded" ? "Slow payment API response" : undefined,
      });
    } catch {
      services.push({
        name: "Payment Processor",
        status: "down",
        responseTime: 0,
        message: "Payment API unreachable",
      });
    }

    const hasDown = services.some((s) => s.status === "down");
    const hasDegraded = services.some((s) => s.status === "degraded");

    const overallStatus = hasDown
      ? "Major Service Disruption"
      : hasDegraded
      ? "Degraded Performance"
      : "All Systems Operational";

    const status = hasDown ? "unhealthy" : hasDegraded ? "degraded" : "healthy";

    const operationalCount = services.filter(
      (s) => s.status === "operational"
    ).length;

    // System metrics
    const mem = process.memoryUsage();

    return {
      status,
      overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),

      services,

      operationalCount,
      totalServices: services.length,

      app: {
        env: process.env.NODE_ENV,
        version: process.env.APP_VERSION ?? "1.0.0",
        nodeVersion: process.version,
      },

      system: {
        memory: {
          rssMB: Math.round(mem.rss / 1024 / 1024),
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        },
        cpu: {
          load1m: os.loadavg()[0],
          load5m: os.loadavg()[1],
          load15m: os.loadavg()[2],
        },
      },
    };
  }

  async getPlatformRevenue(mode: Mode = Mode.live) {
    const revenue = await this.transactionRepository.getRevenueMetrics({
      mode,
    });
    return {
      message: "Revenue retrieved successfully",
      payload: revenue,
    };
  }

  async getDashboardMetrics(mode: Mode= Mode.live) {
    const transactionCount = await this.transactionRepository.countTransaction(mode);
    const merchantCount = await this.userRepository.countMerchants();
    const customerCount = await this.customerRepository.countCustomers(mode);
    const revenueCount = await this.transactionRepository.calculateRevenueGenerated(mode);

    return {
      message: "Dashboard metrics retrieved successfully",
      payload: {
        transactionCount,
        merchantCount,
        customerCount,
        revenueCount,
      },
    };
  }
}
