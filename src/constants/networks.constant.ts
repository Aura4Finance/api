import { TOKENS } from "./tokens.constants";

export const SUPPORTED_NETWORKS = [
  {
    code: "00001",
    name: "Sui",
    symbol: "SUI",
    isActive: true,
    supportedTokens: Object.values(TOKENS),
    smartContractPackageId: "0x68de0aad0d55633e2c8541de539a3e11fe773d507caa1bf16f23879cd201555c",
    explorerUrl: "https://suiexplorer.com",
    logoUrl: "https://res.cloudinary.com/dlhnwgcbe/image/upload/v1772482383/sui_jigntr.jpg",
  },
];
