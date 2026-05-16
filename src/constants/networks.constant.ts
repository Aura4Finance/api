import { TOKENS } from "./tokens.constants";

export const SUPPORTED_NETWORKS = [
  {
    code: "00001",
    name: "Sui",
    symbol: "SUI",
    isActive: true,
    supportedTokens: Object.values(TOKENS),
    smartContractPackageId: {
      testnet: "0xb783a9dbe3bf602b7e95b9f540c824c5dabf792871186d95024106b377d2c983",
      mainnet: "0xa36ac097716f19e21b866a10268fa0e6d1c330bf794dfb14131e5cd244148672"
    },
    explorerUrl: "https://suiexplorer.com",
    logoUrl: "https://res.cloudinary.com/dlhnwgcbe/image/upload/v1772482383/sui_jigntr.jpg",
  },
];
