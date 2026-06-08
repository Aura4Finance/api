import { TOKENS } from "./tokens.constants";

export const SUPPORTED_NETWORKS = [
  {
    code: "00001",
    name: "Sui",
    symbol: "SUI",
    isActive: true,
    supportedTokens: Object.values(TOKENS),
    smartContractPackageId: {
      testnet: "0x81b54465396696d1cbfccff0a69e55cc121d5ab4ecfebfb99544f8b33d35e141",
      mainnet: "0x0de361ffdda051426f0a0310dcb9e95a443a879ae6a8b6092e24bb57b633a3bd"
    },
    explorerUrl: "https://suiexplorer.com",
    logoUrl: "https://res.cloudinary.com/dlhnwgcbe/image/upload/v1772482383/sui_jigntr.jpg",
  },
];

export const getSmartContractId = (env: "mainnet" | "testnet") => {
  const network = SUPPORTED_NETWORKS[0]; // Assuming only one network for now
  return network?.smartContractPackageId[env];
}