import coinMarketClient from "@/config/coinMarketClient-config";
import { STATUS } from "@/constants/status.constant";
import { SUPPORTED_NETWORKS } from "@/constants/networks.constant";
import { FiatController } from "@/controllers/user/fiat.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Request, Response } from "express";
import { QuoteController } from "@/controllers/quote.controller";
import { Container } from "typedi";

const router = express.Router();
const fiatController = Container.get(FiatController);
const quoteController = Container.get(QuoteController);

type CoinMarketFiat = {
  id: number;
  name: string;
  symbol: string;
  sign?: string | null;
};

type CoinMarketFiatMapResponse = {
  status: {
    error_code: number;
  };
  data: CoinMarketFiat[];
};

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
  "/currencies",
  asyncHandler(async (_: Request, res: Response) => {
    const cmcRes = await coinMarketClient.get<CoinMarketFiatMapResponse>("/fiat/map");

    if (
      cmcRes.status !== 200 ||
      cmcRes.data?.status?.error_code !== 0
    ) {
      res.status(STATUS.serverError).json({
        status: "error",
        message: "Unable to fetch active currencies"
      });
      return;
    }

    // Normalize response
    const fiats = cmcRes.data.data.map((fiat) => ({
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
    res.status(STATUS.ok).json({
      status: "success",
      message: "Supported networks retrieved successfully!",
      data: SUPPORTED_NETWORKS,
    });
  })
);

router.get(
    "/quotes",
    asyncHandler((req: express.Request, res: Response) =>        
        quoteController.getTokenPrice(req, res)
    )
);

export default router;