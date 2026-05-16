export const TOKENS = {
  USDC: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    mainnet: {
      coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    },
    testnet: {
      coinType: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
    },
    logoUrl: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
  },

  SUI: {
    name: "Sui",
    symbol: "SUI",
    decimals: 9,
    mainnet: {
      coinType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    },
    testnet: {
      coinType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    },
    logoUrl: "https://assets.coingecko.com/coins/images/26375/standard/sui-ocean-square.png",
  },

  IKA: {
    name: "Ika",
    symbol: "IKA",
    decimals: 9,
    mainnet: {
      coinType: "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA",
    },
    testnet: {
      coinType: null,
    },
    logoUrl: "https://assets.coingecko.com/coins/images/67598/standard/ika.jpg",
  },

  CETUS: {
    name: "Cetus Protocol",
    symbol: "CETUS",
    decimals: 9,
    mainnet: {
      coinType: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
    },
    testnet: {
      coinType: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
    },
    logoUrl: "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/cetus.jpeg/public",
  },

  DEEP: {
    name: "DeepBook",
    symbol: "DEEP",
    decimals: 6,
    mainnet: {
      coinType: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    },
    testnet: {
      coinType: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    },
    logoUrl: "https://images.deepbook.tech/icon.svg",
  },

  BLUE: {
    name: "Bluefin",
    symbol: "BLUE",
    decimals: 9,
    mainnet: {
      coinType: "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE",
    },
    testnet: {
      coinType: null,
    },
    logoUrl: "https://bluefin.io/images/square.png",
  },

  WAL: {
    name: "Walrus",
    symbol: "WAL",
    decimals: 9,
    mainnet: {
      coinType: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    },
    testnet: {
      coinType: "0x8190b041122eb492bf63cb464476bd68c6b7e570a4079645a8b28732b6197a82::wal::WAL",
    },
    logoUrl: "https://walrus.xyz/wal-icon.svg",
  },

  LOFI: {
    name: "LOFI (Lofi the Yeti)",
    symbol: "LOFI",
    decimals: 9,
    mainnet: {
      coinType: "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI",
    },
    testnet: {
      coinType: null,
    },
    logoUrl: "https://cdn.dexscreener.com/cms/images/af69e4eebc3ebb04d6440799c415e2640107fe923411c3b39a55563745553460?width=128&height=128&fit=crop&quality=95&format=auto",
  },

  NAVX: {
    name: "NAVI Protocol",
    symbol: "NAVX",
    decimals: 9,
    mainnet: {
      coinType: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
    },
    testnet: {
      coinType: null,
    },
    logoUrl: "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/navi-new.jpeg/public",
  },

  ALPHA: {
    name: "Alpha Fi",
    symbol: "ALPHA",
    decimals: 9,
    mainnet: {
      coinType: "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA",
    },
    testnet: {
      coinType: null,
    },
    logoUrl: "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/_MCfJKCnm7HFHwGk_JW1B-AU9kjOe3FtYe-ay75YcgI.png/public",
  },
} as const;

export type TokenSymbol = keyof typeof TOKENS;

export function getCoinType(
  symbol: TokenSymbol,
  env: "mainnet" | "testnet"
): string | null {
  return TOKENS[symbol][env].coinType ?? null;
}

export function getCoinDecimal(
  symbol: TokenSymbol
): number {
  return 10 ** TOKENS[symbol].decimals; 
}