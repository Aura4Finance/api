import coinMarketClient from "@/config/coinMarketClient-config";
import { STATUS } from "@/constants/status.constant";
import { FiatController } from "@/controllers/user/fiat.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Request, Response } from "express";
import Container from "typedi";

const router = express.Router();
const fiatController = Container.get(FiatController);

router.get("/banks",
  asyncHandler((req: Request, res: Response) =>
    fiatController.getBanks(req, res))
);

router.get("/resolve-account",
  asyncHandler((req: Request, res: Response) =>
    fiatController.resolveAccount(req, res))
);

router.get("/rates",
  asyncHandler((req: Request, res: Response) =>
    fiatController.getRates(req, res))
);

router.get(
  "/currency",
  asyncHandler(async (_: Request, res: Response) => {
    const cmcRes = await coinMarketClient.get("/fiat/map");

    if (
      cmcRes.status !== 200 ||
      cmcRes.data?.status?.error_code !== 0
    ) {
      res.status(STATUS.serverError).json({
        status: "error",
        message: "Unable to fetch active currencies"
      })
    }

    // Normalize response
    const fiats = cmcRes.data.data.map((fiat: any) => ({
      id: fiat.id,
      name: fiat.name,
      symbol: fiat.symbol,
      sign: fiat.sign || null,
      isActive: true,
    }));

    res.status(STATUS.ok).json({
      status: "success",
      message: "Supported currencies retrieved successfully!",
      data: {
        count: fiats.length,
        fiats
      }
    });
  })
);

router.get(
  "/networks",
  asyncHandler(async (_: Request, res: Response) => {
    const networks = [
      {
        id: "sui",
        name: "Sui",
        symbol: "SUI",
        chainId: "mainnet|testnet",
        isActive: true,
        supportsTokens: true,
        supportsSmartContracts: true,
        explorerUrl: "https://suiexplorer.com",
        logoUrl: "https://yourcdn.com/networks/sui.png",
      },
    ];

    res.status(STATUS.ok).json({
      status: "success",
      message: "Support networks retrieved successfully!",
      data: networks,
    });
  })
);

export default router;