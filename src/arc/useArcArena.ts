import { useState, useCallback } from 'react'
import { createPublicClient, createWalletClient, http, custom, parseUnits, formatUnits } from 'viem'
import { useWallets } from '@privy-io/react-auth'
import { arcTestnet } from './chain'
import { PREDARENA_ABI, ERC20_ABI } from './abi'
import { PREDARENA_ADDRESS, USDC_ADDRESS, ArcSide, ArcStatus } from './contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArcBattle {
  id:           bigint
  coinA:        string
  coinB:        string
  league:       string
  duration:     string
  startTime:    bigint
  endTime:      bigint
  startPriceA:  bigint
  startPriceB:  bigint
  finalPriceA:  bigint
  finalPriceB:  bigint
  poolA:        bigint
  poolB:        bigint
  poolDraw:     bigint
  totalPool:    bigint
  winner:       number
  status:       number
}

// ── Public client (read-only, no wallet needed) ───────────────────────────────

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.network'),
})

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useArcArena() {
  const { wallets } = useWallets()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Get the connected EVM wallet from Privy
  const getEVMWallet = useCallback(() => {
    const evmWallet = wallets.find(w => w.chainId?.startsWith("eip155:"))
    if (!evmWallet) throw new Error('No EVM wallet connected. Please connect a wallet first.')
    return evmWallet
  }, [wallets])

  // Build a wallet client from the connected EVM wallet
  const getWalletClient = useCallback(async () => {
    const evmWallet = wallets.find(w => w.chainId?.startsWith('eip155:'))
    const provider = evmWallet
      ? await evmWallet.getEthereumProvider()
      : (window as any).ethereum
    if (!provider) throw new Error('No EVM wallet found. Please connect MetaMask.')
    if (!evmWallet && provider) {
      await provider.request({ method: 'eth_requestAccounts' })
    }
    return createWalletClient({
      chain:     arcTestnet,
      transport: custom(provider),
    })
  }, [wallets])

  // ── Read: get a single battle ───────────────────────────────────────────────

  const getBattle = useCallback(async (battleId: bigint): Promise<ArcBattle> => {
    const result = await publicClient.readContract({
      address:      PREDARENA_ADDRESS,
      abi:          PREDARENA_ABI,
      functionName: 'getBattle',
      args:         [battleId],
    })
    return result as ArcBattle
  }, [])

  // ── Read: get user's USDC balance in the arena contract ────────────────────

  const getArenaBalance = useCallback(async (address: `0x${string}`): Promise<string> => {
    const raw = await publicClient.readContract({
      address:      PREDARENA_ADDRESS,
      abi:          PREDARENA_ABI,
      functionName: 'getBalance',
      args:         [address],
    }) as bigint
    return formatUnits(raw, 6) // USDC has 6 decimals
  }, [])

  // ── Read: get user's USDC wallet balance ───────────────────────────────────

  const getUSDCBalance = useCallback(async (address: `0x${string}`): Promise<string> => {
    const raw = await publicClient.readContract({
      address:      USDC_ADDRESS,
      abi:          ERC20_ABI,
      functionName: 'balanceOf',
      args:         [address],
    }) as bigint
    return formatUnits(raw, 6)
  }, [])

  // ── Write: approve USDC then place a single bet ────────────────────────────

  const placeBet = useCallback(async (
    battleId:       bigint,
    side:           ArcSide,
    stakeUSDC:      string,   // human-readable e.g. "10.50"
    guaranteedOdds: bigint,   // e.g. 17600n = 1.76x
  ) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const stakeRaw     = parseUnits(stakeUSDC, 6) // convert to 6dp

      // Step 1: Approve the arena to spend USDC
      const approveTx = await walletClient.writeContract({
        address:      USDC_ADDRESS,
        abi:          ERC20_ABI,
        functionName: 'approve',
        args:         [PREDARENA_ADDRESS, stakeRaw],
        account:      address,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveTx })

      // Step 2: Place the bet
      const betTx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'placeBet',
        args:         [battleId, side, stakeRaw, guaranteedOdds],
        account:      address,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: betTx })
      return receipt
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  // ── Write: withdraw winnings ────────────────────────────────────────────────

  const withdraw = useCallback(async (amountUSDC: string) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const amountRaw    = parseUnits(amountUSDC, 6)

      const tx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'withdraw',
        args:         [amountRaw],
        account:      address,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      return receipt
    } catch (err: any) {
      setError(err.message || 'Withdrawal failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  // ── Write: deposit USDC into arena ─────────────────────────────────────────

  const deposit = useCallback(async (amountUSDC: string) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const amountRaw    = parseUnits(amountUSDC, 6)

      // Approve first
      const approveTx = await walletClient.writeContract({
        address:      USDC_ADDRESS,
        abi:          ERC20_ABI,
        functionName: 'approve',
        args:         [PREDARENA_ADDRESS, amountRaw],
        account:      address,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveTx })

      // Then deposit
      const tx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'deposit',
        args:         [amountRaw],
        account:      address,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      return receipt
    } catch (err: any) {
      setError(err.message || 'Deposit failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Format USDC pool size for display e.g. 64800000000n → "$64,800"
  const formatUSDC = (raw: bigint): string => {
    const n = Number(formatUnits(raw, 6))
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Check if a battle is on Arc (status Live or Settled)
  const isLive = (battle: ArcBattle): boolean =>
    battle.status === ArcStatus.Live && BigInt(Math.floor(Date.now() / 1000)) < battle.endTime

  return {
    // State
    loading,
    error,
    // Read
    getBattle,
    getArenaBalance,
    getUSDCBalance,
    // Write
    placeBet,
    withdraw,
    deposit,
    // Helpers
    formatUSDC,
    isLive,
    ArcSide,
    ArcStatus,
    // Constants
    PREDARENA_ADDRESS,
    USDC_ADDRESS,
  }
}
