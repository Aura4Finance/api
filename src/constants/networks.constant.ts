import { TOKENS } from "@/constants/tokens.constants";

export const SUPPORTED_NETWORKS = [
  {
    code: "00001",
    name: "Sui",
    symbol: "SUI",
    isActive: true,
    supportedTokens: Object.values(TOKENS),
    smartContractPackageId: {
      testnet: "0x114e10d9996399e8b95b22a70163e9d0189b34d2e437c20b561372b5c581727f",
      mainnet: "0x48e0d4fe8ac8441bcf154dbff739c462708b33e183cbff493538f2364650a16f"
    },
    explorerUrl: "https://suiexplorer.com",
    logoUrl: "https://res.cloudinary.com/dlhnwgcbe/image/upload/v1772482383/sui_jigntr.jpg",
  },
];

export const getSmartContractId = (env: "mainnet" | "testnet") => {
  const network = SUPPORTED_NETWORKS[0]; // Assuming only one network for now
  return network?.smartContractPackageId[env];
}