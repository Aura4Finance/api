import { TOKENS } from "./tokens.constants";

export const SUPPORTED_NETWORKS = [
  {
    code: "00001",
    name: "Sui",
    symbol: "SUI",
    isActive: true,
    supportedTokens: Object.values(TOKENS),
    smartContractPackageId: {
      testnet: "0xbda9c393d897c1837063e87aea4dff6d22ae08725e39c68b6fbeddf8a8bbeb4c",
      mainnet: "0x68de0aad0d55633e2c8541de539a3e11fe773d507caa1bf16f23879cd201555c"
    },
    explorerUrl: "https://suiexplorer.com",
    logoUrl: "https://res.cloudinary.com/dlhnwgcbe/image/upload/v1772482383/sui_jigntr.jpg",
  },
];
