// Arc Testnet
export const PREDARENA_ADDRESS = '0xA6D45CA5DF71F064193Fcbb139252032D5950a9E' as const
export const USDC_ADDRESS      = '0x3600000000000000000000000000000000000000' as const

// Side enum — mirrors Solidity: None=0, CoinA=1, CoinB=2, Draw=3
export enum ArcSide {
  None  = 0,
  CoinA = 1,
  CoinB = 2,
  Draw  = 3,
}

// Status enum — mirrors Solidity: Pending=0, Live=1, Settled=2, Cancelled=3
export enum ArcStatus {
  Pending   = 0,
  Live      = 1,
  Settled   = 2,
  Cancelled = 3,
}
