import { TOKENS } from "./tokens.constants";

export const SUPPORTED_NETWORKS = [
  {
    code: "00001",
    name: "Sui",
    symbol: "SUI",
    isActive: true,
    supportedTokens: Object.values(TOKENS),
    smartContractPackageId: {
      testnet: "0x8917ae6cbfe261333cee738b47af6f31636548617c04437704e22b628a9003fd",
      mainnet: "0xbe1526976d757a90ab59b287a29f547f86ec5ea3b7f361ce3822339e726ae983"
    },
    explorerUrl: "https://suiexplorer.com",
    logoUrl: "https://res.cloudinary.com/dlhnwgcbe/image/upload/v1772482383/sui_jigntr.jpg",
  },
];
