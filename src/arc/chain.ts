import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  // Arc's NATIVE gas token is 18-decimal, even though the USDC ERC-20 interface
  // at 0x3600... is 6-decimal - both views share one underlying balance. This
  // said 6, which under-reported every native balance by a factor of 1e12.
  // Read balances through the ERC-20 interface; this block is gas only.
  nativeCurrency: {
    decimals: 18,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})
