import { useState, useCallback } from 'react'
import { createPublicClient, createWalletClient, http, custom, parseUnits, formatUnits, maxUint256 } from 'viem'
import { useWallets } from '@privy-io/react-auth'
import { arcTestnet } from './chain'
import { PREDARENA_ABI, ERC20_ABI } from './abi'
import { PREDARENA_ADDRESS, USDC_ADDRESS, ArcSide, ArcStatus } from './contracts'

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirrors the Battle struct. The pool fields are gone: the contract is a pure
// fixed-odds book now, so there is no parimutuel pool to track.
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
  winner:       number
  status:       number
}

export interface ArcTicket {
  id:       bigint
  battleId: bigint
  player:   `0x${string}`
  side:     number
  stake:    bigint
  odds:     bigint
  payout:   bigint
  closed:   boolean
}

const QUOTE_ERRORS: Record<string, string> = {
  need_2_legs:            'A combo needs at least 2 selections',
  too_many_legs:          'Too many legs for one combo',
  duplicate_leg:          'You have two picks on the same battle',
  combo_odds_too_high:    'Those combined odds are out of range',
  battle_not_on_arc:      'This battle is not available on Arc yet',
  battle_not_live:        'This battle is no longer live',
  battle_ended:           'This battle has ended',
  betting_locked:         'Betting is closed for this battle',
  pricing_unavailable:    'Price feed unavailable — try again in a moment',
  insufficient_liquidity: 'The house cannot cover this bet right now — try a smaller stake',
  odds_too_high:          'Those odds are out of range',
  invalid_stake:          'Enter a valid stake',
}

// ── Public client (read-only, no wallet needed) ───────────────────────────────

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http((process.env.REACT_APP_ARC_RPC_URL || 'https://arc-testnet.drpc.org')),
})

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useArcArena() {
  const { wallets } = useWallets()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getEVMWallet = useCallback(() => {
    const evmWallet = wallets.find(w => w.chainId?.startsWith("eip155:"))
    if (!evmWallet) throw new Error('No EVM wallet connected. Please connect a wallet first.')
    return evmWallet
  }, [wallets])

  const getWalletClient = useCallback(async () => {
    const evmWallet = wallets.find(w => w.chainId?.startsWith('eip155:'))
    const provider = evmWallet
      ? await evmWallet.getEthereumProvider()
      : (window as any).ethereum
    if (!provider) throw new Error('No EVM wallet found. Please connect MetaMask.')
    if (!evmWallet && provider) {
      await provider.request({ method: 'eth_requestAccounts' })
    }
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x4CEF52' }],
      })
    } catch (switchErr) {
      if ((switchErr as any).code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x4CEF52',
            chainName: 'Arc Testnet',
            // Arc's NATIVE gas token is 18dp; only the USDC ERC-20 interface is
            // 6dp. Declaring 6 here under-reports the wallet's gas balance by 1e12.
            nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
            rpcUrls: [(process.env.REACT_APP_ARC_RPC_URL || 'https://arc-testnet.drpc.org')],
            blockExplorerUrls: ['https://testnet.arcscan.app'],
          }]
        })
      }
    }
    return createWalletClient({
      chain:     arcTestnet,
      transport: custom(provider),
    })
  }, [wallets])

  // ── Reads ───────────────────────────────────────────────────────────────────

  const getBattle = useCallback(async (battleId: bigint): Promise<ArcBattle> => {
    const result = await publicClient.readContract({
      address:      PREDARENA_ADDRESS,
      abi:          PREDARENA_ABI,
      functionName: 'getBattle',
      args:         [battleId],
    })
    return result as unknown as ArcBattle
  }, [])

  const getTicket = useCallback(async (ticketId: bigint): Promise<ArcTicket> => {
    const result = await publicClient.readContract({
      address:      PREDARENA_ADDRESS,
      abi:          PREDARENA_ABI,
      functionName: 'getTicket',
      args:         [ticketId],
    })
    return result as unknown as ArcTicket
  }, [])

  const getPlayerTickets = useCallback(async (address: `0x${string}`): Promise<bigint[]> => {
    const ids = await publicClient.readContract({
      address:      PREDARENA_ADDRESS,
      abi:          PREDARENA_ABI,
      functionName: 'getPlayerTickets',
      args:         [address],
    }) as readonly bigint[]
    return [...ids]
  }, [])

  const getUSDCBalance = useCallback(async (address: `0x${string}`): Promise<string> => {
    const raw = await publicClient.readContract({
      address:      USDC_ADDRESS,
      abi:          ERC20_ABI,
      functionName: 'balanceOf',
      args:         [address],
    }) as bigint
    return formatUnits(raw, 6)
  }, [])

  // How much exposure the house can still back. Useful for showing the user why
  // a big stake was refused before they spend gas finding out.
  const getFreeCapital = useCallback(async (): Promise<string> => {
    const raw = await publicClient.readContract({
      address:      PREDARENA_ADDRESS,
      abi:          PREDARENA_ABI,
      functionName: 'freeCapital',
    }) as bigint
    return formatUnits(raw, 6)
  }, [])

  // ── Write: place a bet ──────────────────────────────────────────────────────

  /**
   * The contract refuses any bet without an EIP-712 quote signed by our quoter
   * key, so this is a three-step dance:
   *
   *   1. approve (only if the allowance is short)
   *   2. fetch a signed quote  <- 60s TTL
   *   3. placeBet with the signature
   *
   * The approve goes FIRST on purpose. It needs a wallet confirmation, which can
   * take as long as the user takes — and if the quote were already in hand, its
   * 60-second clock would be burning the whole time and the bet would revert with
   * `quote_expired`. Fetch the quote once the slow part is behind us.
   */
  const placeBet = useCallback(async (
    battleUuid:  string,    // Supabase battle UUID — what the quote API keys on
    arcBattleId: bigint,    // the on-chain battle id
    side:        ArcSide,
    stakeUSDC:   string,    // human-readable e.g. "10.50"
  ) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const stakeRaw     = parseUnits(stakeUSDC, 6)

      // 1. Approve only when we have to. Max approval means returning bettors
      //    get a single popup instead of two.
      const allowance = await publicClient.readContract({
        address:      USDC_ADDRESS,
        abi:          ERC20_ABI,
        functionName: 'allowance',
        args:         [address, PREDARENA_ADDRESS],
      }) as bigint

      if (allowance < stakeRaw) {
        const approveTx = await walletClient.writeContract({
          address:      USDC_ADDRESS,
          abi:          ERC20_ABI,
          functionName: 'approve',
          args:         [PREDARENA_ADDRESS, maxUint256],
          account:      address,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
      }

      // 2. Now that nothing slow is left, get the quote.
      const qRes = await fetch('/api/arc-quote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player:    address,
          battle_id: battleUuid,
          side:      Number(side),
          stake:     Number(stakeUSDC),
        }),
      })
      const quote = await qRes.json()
      if (!qRes.ok) {
        throw new Error(QUOTE_ERRORS[quote.error] || quote.error || 'Could not price this bet')
      }

      // 3. Place it. Odds come from the quote — the bettor never picks them.
      const betTx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'placeBet',
        args: [
          arcBattleId,
          Number(side),
          BigInt(quote.stake),
          BigInt(quote.odds),
          BigInt(quote.nonce),
          BigInt(quote.deadline),
          quote.signature as `0x${string}`,
        ],
        account: address,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: betTx })
      return { receipt, txHash: betTx, odds: quote.odds_display as number }
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Transaction failed'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  /**
   * Places a combo on Arc. Same three-step dance as placeBet - approve, quote,
   * send - and the approve goes first for the same reason: the quote's 60s clock
   * must not burn while the user stares at a wallet popup.
   *
   * The contract re-derives legsHash from the arrays we pass and checks the
   * quoter's signature over it, so battleIds/sides/odds must be sent in EXACTLY
   * the order the server signed. Reordering them is a silent bad_quote.
   */
  const placeCombo = useCallback(async (
    battleUuids: string[],   // Supabase UUIDs - what the quote API keys on
    sides:       ArcSide[],
    stakeUSDC:   string,
  ) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const stakeRaw     = parseUnits(stakeUSDC, 6)

      // 1. Approve only when short. Max approval => one popup for repeat bettors.
      const allowance = await publicClient.readContract({
        address:      USDC_ADDRESS,
        abi:          ERC20_ABI,
        functionName: 'allowance',
        args:         [address, PREDARENA_ADDRESS],
      }) as bigint

      if (allowance < stakeRaw) {
        const approveTx = await walletClient.writeContract({
          address:      USDC_ADDRESS,
          abi:          ERC20_ABI,
          functionName: 'approve',
          args:         [PREDARENA_ADDRESS, maxUint256],
          account:      address,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
      }

      // 2. Quote, now that the slow part is done.
      const qRes = await fetch('/api/arc-combo-quote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player: address,
          stake:  Number(stakeUSDC),
          legs:   battleUuids.map((id, i) => ({ battle_id: id, side: Number(sides[i]) })),
        }),
      })
      const quote = await qRes.json()
      if (!qRes.ok) {
        throw new Error(QUOTE_ERRORS[quote.error] || quote.error || 'Could not price this combo')
      }

      // 3. Send, in the server's exact order.
      const comboTx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'placeCombo',
        args: [
          (quote.battle_ids as string[]).map((b) => BigInt(b)),
          (quote.sides as number[]).map((x) => Number(x)),
          (quote.odds as string[]).map((o) => BigInt(o)),
          BigInt(quote.stake),
          BigInt(quote.combo_odds),
          BigInt(quote.nonce),
          BigInt(quote.deadline),
          quote.signature as `0x\${string}`,
        ],
        account: address,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: comboTx })
      return {
        receipt,
        txHash: comboTx,
        comboOdds: quote.combo_odds_display as number,
        // ComboPlaced does not carry per-leg odds, so the mirror needs these
        // from us. The server checks their product against the on-chain
        // comboOdds before recording, so this is verified, not trusted.
        legOdds: quote.odds as string[],
      }
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Transaction failed'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  // ── Write: claim a winning ticket ───────────────────────────────────────────

  // Payouts are pull-based now: settlement only records the winner, and each
  // winner claims their own stake x odds. That's what killed the old unbounded
  // settlement loop that could run a popular battle out of gas.
  const claim = useCallback(async (ticketId: bigint) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const tx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'claim',
        args:         [ticketId],
        account:      address,
      })
      return await publicClient.waitForTransactionReceipt({ hash: tx })
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Claim failed'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  // Refund a ticket whose battle was cancelled.
  const refund = useCallback(async (ticketId: bigint) => {
    setLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient()
      const [address]    = await walletClient.getAddresses()
      const tx = await walletClient.writeContract({
        address:      PREDARENA_ADDRESS,
        abi:          PREDARENA_ABI,
        functionName: 'refund',
        args:         [ticketId],
        account:      address,
      })
      return await publicClient.waitForTransactionReceipt({ hash: tx })
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'Refund failed'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getWalletClient])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatUSDC = (raw: bigint): string => {
    const n = Number(formatUnits(raw, 6))
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const isLive = (battle: ArcBattle): boolean =>
    battle.status === ArcStatus.Live && BigInt(Math.floor(Date.now() / 1000)) < battle.endTime

  return {
    loading,
    error,
    // Read
    getBattle,
    getTicket,
    getPlayerTickets,
    getUSDCBalance,
    getFreeCapital,
    // Write
    placeBet,
    placeCombo,
    claim,
    refund,
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
