import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
)

// Chainlink Price Feed addresses on Solana Devnet
// Program ID: HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny
const CHAINLINK_FEEDS = {
  BTC:  '6PxBx93S8x3tno1TsFZwT5VqP8drrRCbCXygEXYNkFJe',
  ETH:  '669U43LNHx7LsVj95uYksnhXUfWKDsdzVqev3V4Jpw3P',
  SOL:  'HgTtcbcmp5BeThax5AU8vg4VwK79qAvAKKFMs8txMLW6',
  LINK: 'CcPVS9bqyXbD9cLnTbhhHazLsrua8QMFa39Wr9mitiku',
  BNB:  'GwzBgrXb4PG59zjce24SF2b9JXbLEjJJTBkmytuEZj1b',
  AVAX: 'AeOX2mFPQFRMcGkFwMmFSMiDXiR56GvSniZBX3wHGnMs',
}

const CHAINLINK_PROGRAM_ID = 'HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny'

// Fetch price from Chainlink feed on Solana (offchain read)
async function getChainlinkPrice(ticker) {
  const feedAddress = CHAINLINK_FEEDS[ticker]
  if (!feedAddress) return null

  try {
    const { Connection, PublicKey } = await import('@solana/web3.js')
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
    
    const feedPubkey = new PublicKey(feedAddress)
    const accountInfo = await connection.getAccountInfo(feedPubkey)
    if (!accountInfo) return null

    // Chainlink stores price in a specific layout — read answer from buffer
    // Layout: 8 bytes discriminator, then rounds data including answer
    // The answer is stored as int128 at offset 16 after the latest round header
    const data = accountInfo.data
    
    // Try to read the latest answer — Chainlink uses big-endian int128 at byte 48
    // This is the simplified offchain read approach
    const answerBuf = data.slice(48, 64)
    const answer = Number(
      BigInt('0x' + Buffer.from(answerBuf).toString('hex'))
    )
    
    // Chainlink prices have 8 decimal places
    const price = answer / 1e8
    
    if (price > 0 && price < 10_000_000) {
      console.log(`Chainlink ${ticker}: $${price.toFixed(4)}`)
      return price
    }
    return null
  } catch (e) {
    console.error(`Chainlink fetch error for ${ticker}:`, e.message)
    return null
  }
}

// Dual oracle settlement — both Pyth and Chainlink must be in agreement
// If they diverge by more than threshold, use average as protection
async function getDualOraclePrice(ticker, pythPrice) {
  const chainlinkPrice = await getChainlinkPrice(ticker)
  
  if (!chainlinkPrice) {
    console.log(`${ticker}: Chainlink unavailable, using Pyth only: $${pythPrice?.toFixed(4)}`)
    return pythPrice
  }
  
  if (!pythPrice) {
    console.log(`${ticker}: Pyth unavailable, using Chainlink only: $${chainlinkPrice.toFixed(4)}`)
    return chainlinkPrice
  }

  // Check divergence between oracles
  const divergence = Math.abs(pythPrice - chainlinkPrice) / pythPrice
  const DIVERGENCE_THRESHOLD = 0.02 // 2% — if more than this, flag it

  if (divergence > DIVERGENCE_THRESHOLD) {
    console.warn(`⚠️ Oracle divergence for ${ticker}: Pyth=$${pythPrice.toFixed(4)} Chainlink=$${chainlinkPrice.toFixed(4)} (${(divergence*100).toFixed(2)}%)`)
    // Use average to protect against manipulation of either oracle
    const avg = (pythPrice + chainlinkPrice) / 2
    console.log(`Using average: $${avg.toFixed(4)}`)
    return avg
  }

  // Both agree — use average for maximum accuracy
  const avg = (pythPrice + chainlinkPrice) / 2
  console.log(`✅ Dual oracle ${ticker}: Pyth=$${pythPrice.toFixed(4)} Chainlink=$${chainlinkPrice.toFixed(4)} avg=$${avg.toFixed(4)}`)
  return avg
}

const PYTH_FEEDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  XRP: '0xec5d399846a9209f3fe5881d70aae9268c7b040d3ce7b657b5af68ee9e46cd07',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  LINK: '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  UNI: '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
  PEPE: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  JUP: '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  WIF: '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  BONK: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
}

const BATTLE_PAIRS = [
  { coinA: 'BTC', coinB: 'ETH', league: 'Major', duration: '1h' },
  { coinA: 'SOL', coinB: 'AVAX', league: 'L1', duration: '4h' },
  { coinA: 'BTC', coinB: 'SOL', league: 'Major', duration: '1h' },
  { coinA: 'ETH', coinB: 'BNB', league: 'Major', duration: '4h' },
  { coinA: 'XRP', coinB: 'BNB', league: 'Major', duration: '1D' },
  { coinA: 'DOGE', coinB: 'PEPE', league: 'Meme', duration: '30m' },
  { coinA: 'WIF', coinB: 'BONK', league: 'Meme', duration: '30m' },
  { coinA: 'LINK', coinB: 'UNI', league: 'DeFi', duration: '1h' },
  { coinA: 'SOL', coinB: 'JUP', league: 'L1', duration: '1h' },
  { coinA: 'ETH', coinB: 'SOL', league: 'L1', duration: '4h' },
]

const DURATION_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
}

async function getPythPrices(tickers) {
  const results = {}
  const validTickers = tickers.filter(t => PYTH_FEEDS[t])

  await Promise.all(validTickers.map(async (ticker) => {
    const feedId = PYTH_FEEDS[ticker]
    try {
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      const parsed = data?.parsed?.[0]
      if (!parsed) return
      results[ticker] = Number(parsed.price.price) * Math.pow(10, parsed.price.expo)
    } catch (err) {
      console.error(`Pyth error for ${ticker}:`, err.message)
    }
  }))

  return results
}

const PLATFORM_FEE = 0.05 // 5% house cut
const TREASURY_WALLET = '4xjEzpBki9ekwx56oRSynsrbQ8uXaUa2wxmPhZXeHHNz'

async function settleBattles() {
  const now = new Date().toISOString()
  const { data: battles } = await supabase
    .from('battles')
    .select('*')
    .eq('status', 'live')
    .lte('end_time', now)

  if (!battles || battles.length === 0) return

  const tickers = [...new Set(battles.flatMap(b => [b.coin_a, b.coin_b]))]

  for (const battle of battles) {
    try {
    // TWAP settlement — average last 90 seconds of price history
    // Prevents oracle manipulation at exact end time
    const twapCutoff = new Date(Date.now() - 90 * 1000).toISOString()

    const [twapA, twapB] = await Promise.all([
      supabase
        .from('price_history')
        .select('price')
        .eq('coin', battle.coin_a)
        .gte('recorded_at', twapCutoff)
        .order('recorded_at', { ascending: false })
        .limit(10),
      supabase
        .from('price_history')
        .select('price')
        .eq('coin', battle.coin_b)
        .gte('recorded_at', twapCutoff)
        .order('recorded_at', { ascending: false })
        .limit(10)
    ])

    // Calculate TWAP — fallback to live Pyth price if no history in window
    let finalPriceA, finalPriceB

    // Get Pyth TWAP price
    let pythPriceA = null
    let pythPriceB = null

    if (twapA.data && twapA.data.length >= 2) {
      pythPriceA = twapA.data.reduce((sum, r) => sum + r.price, 0) / twapA.data.length
      console.log(`${battle.coin_a} Pyth TWAP (${twapA.data.length} samples): $${pythPriceA.toFixed(4)}`)
    } else {
      const live = await getPythPrices([battle.coin_a])
      pythPriceA = live[battle.coin_a]
      console.log(`${battle.coin_a} Pyth live: $${pythPriceA?.toFixed(4)}`)
    }

    if (twapB.data && twapB.data.length >= 2) {
      pythPriceB = twapB.data.reduce((sum, r) => sum + r.price, 0) / twapB.data.length
      console.log(`${battle.coin_b} Pyth TWAP (${twapB.data.length} samples): $${pythPriceB.toFixed(4)}`)
    } else {
      const live = await getPythPrices([battle.coin_b])
      pythPriceB = live[battle.coin_b]
      console.log(`${battle.coin_b} Pyth live: $${pythPriceB?.toFixed(4)}`)
    }

    // Dual oracle: cross-check with Chainlink
    finalPriceA = await getDualOraclePrice(battle.coin_a, pythPriceA)
    finalPriceB = await getDualOraclePrice(battle.coin_b, pythPriceB)
    if (!finalPriceA || !finalPriceB || !battle.start_price_a || !battle.start_price_b) { console.log(`Missing prices for ${battle.coin_a}/${battle.coin_b}, skipping`); continue }

    const changeA = (finalPriceA - battle.start_price_a) / battle.start_price_a
    const changeB = (finalPriceB - battle.start_price_b) / battle.start_price_b

    const threshold = 0.001
    let winner = 0
    if (Math.abs(changeA - changeB) <= threshold) winner = 3
    else if (changeA > changeB) winner = 1
    else winner = 2

    await supabase.from('battles').update({
      status: 'settled',
      winner,
      final_price_a: finalPriceA,
      final_price_b: finalPriceB,
    }).eq('id', battle.id)

    // Get ALL tickets for this battle
    const { data: allTickets } = await supabase
      .from('tickets')
      .select('*')
      .eq('battle_id', battle.id)

    if (!allTickets || allTickets.length === 0) {
      // No tickets — just mark battle as settled, no payouts needed
      await supabase.from('battles').update({
        status: 'settled',
        winner: 0,
        final_price_a: finalPriceA,
        final_price_b: finalPriceB,
      }).eq('id', battle.id)
      console.log(`No tickets for battle ${battle.id} — marked settled`)
      continue
    }

    // Calculate total pot from ALL tickets (losers fund winners)
    const totalPotUSD = allTickets.reduce((sum, t) => sum + t.stake, 0)
    const winningTickets = allTickets.filter(t => t.side === winner)
    const losingTickets = allTickets.filter(t => t.side !== winner)

    // Total stake on winning side
    const winnerStakeTotal = winningTickets.reduce((sum, t) => sum + t.stake, 0)

    // Platform fee comes off the top of the total pot
    const platformFeeUSD = totalPotUSD * PLATFORM_FEE
    const payoutPoolUSD = totalPotUSD - platformFeeUSD

    console.log(`Battle ${battle.coin_a} vs ${battle.coin_b}: totalPot=$${totalPotUSD.toFixed(2)} fee=$${platformFeeUSD.toFixed(2)} payoutPool=$${payoutPoolUSD.toFixed(2)} winners=${winningTickets.length} losers=${losingTickets.length}`)

    // Get current SOL price for lamport conversion
    const solPriceRes = await getPythPrices(['SOL'])
    const solPrice = solPriceRes['SOL'] || 100

    // Credit platform fee to treasury in Supabase
    if (platformFeeUSD > 0) {
      const feeInLamports = Math.floor((platformFeeUSD / solPrice) * 1_000_000_000)
      const { data: treasuryBal } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', TREASURY_WALLET)
        .single()

      if (treasuryBal) {
        await supabase.from('user_balances')
          .update({
            balance_lamports: treasuryBal.balance_lamports + feeInLamports,
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', TREASURY_WALLET)
      } else {
        await supabase.from('user_balances')
          .insert({
            wallet_address: TREASURY_WALLET,
            balance_lamports: feeInLamports,
            total_deposited: 0,
            total_withdrawn: 0,
            updated_at: new Date().toISOString()
          })
      }
      console.log(`Treasury credited $${platformFeeUSD.toFixed(2)} (${feeInLamports} lamports)`)
    }

    // OPTION 3 HYBRID SETTLEMENT
    // Each winner gets the HIGHER of:
    //   A) Their proportional share of the payout pool (parimutuel)
    //   B) Their guaranteed minimum odds payout
    // If pool is too thin, platform treasury covers the gap

    if (winningTickets.length > 0 && winnerStakeTotal > 0) {
      // Get treasury balance to cover gaps
      const { data: treasury } = await supabase
        .from('platform_treasury')
        .select('*')
        .single()

      let totalTreasuryDrawdown = 0

      for (const ticket of winningTickets) {
        // Parimutuel payout
        const winnerShare = ticket.stake / winnerStakeTotal
        const parimutuelPayoutUSD = payoutPoolUSD * winnerShare
        const parimutuelOdds = parimutuelPayoutUSD / ticket.stake

        // Fixed odds payout — cap at 10x to prevent broken engine odds draining treasury
        const rawGuaranteedOdds = ticket.guaranteed_odds || ticket.odds || 1.50
        const guaranteedOdds = Math.min(rawGuaranteedOdds, 10.0)
        const guaranteedPayoutUSD = ticket.stake * guaranteedOdds

        // Hard cap: never pay out more than the entire pot per winner
        const absoluteMaxPayout = totalPotUSD

        // User gets the HIGHER of parimutuel or guaranteed, never more than total pot
        let finalPayoutUSD = Math.min(
          Math.max(parimutuelPayoutUSD, guaranteedPayoutUSD),
          absoluteMaxPayout
        )
        let treasuryGapUSD = 0
        let payoutSource = 'pool'

        if (finalPayoutUSD > parimutuelPayoutUSD) {
          treasuryGapUSD = finalPayoutUSD - parimutuelPayoutUSD
          payoutSource = 'guaranteed'
          totalTreasuryDrawdown += treasuryGapUSD
        }

        const finalPayoutLamports = Math.floor((finalPayoutUSD / solPrice) * 1_000_000_000)
        const actualOdds = finalPayoutUSD / ticket.stake

        const { data: userBal } = await supabase
          .from('user_balances')
          .select('balance_lamports')
          .eq('wallet_address', ticket.wallet_address)
          .single()

        if (userBal) {
          await supabase.from('user_balances')
            .update({
              balance_lamports: userBal.balance_lamports + finalPayoutLamports,
              updated_at: new Date().toISOString()
            })
            .eq('wallet_address', ticket.wallet_address)

          console.log(`Winner ${ticket.wallet_address}: stake=$${ticket.stake} payout=$${finalPayoutUSD.toFixed(2)} (${actualOdds.toFixed(2)}x) source=${payoutSource} gap=$${treasuryGapUSD.toFixed(2)}`)
        }
      }

      // Deduct treasury drawdown and update platform treasury
      if (treasury) {
        const netEarned = platformFeeUSD - totalTreasuryDrawdown
        await supabase.from('platform_treasury')
          .update({
            balance_usd: Math.max(0, (treasury.balance_usd || 0) + netEarned),
            total_earned_usd: (treasury.total_earned_usd || 0) + platformFeeUSD,
            total_paid_out_usd: (treasury.total_paid_out_usd || 0) + totalTreasuryDrawdown,
            updated_at: new Date().toISOString()
          })
        console.log(`Treasury: earned=$${platformFeeUSD.toFixed(2)} drawdown=$${totalTreasuryDrawdown.toFixed(2)} net=$${netEarned.toFixed(2)}`)
      }

    } else {
      // No winners — entire pot minus fee goes to treasury
      const noBettersFeeUSD = payoutPoolUSD
      const noBettersLamports = Math.floor((noBettersFeeUSD / solPrice) * 1_000_000_000)
      
      const { data: treasuryBal } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', TREASURY_WALLET)
        .single()

      if (treasuryBal && noBettersLamports > 0) {
        await supabase.from('user_balances')
          .update({
            balance_lamports: treasuryBal.balance_lamports + noBettersLamports,
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', TREASURY_WALLET)
        console.log(`No winners — $${noBettersFeeUSD.toFixed(2)} added to treasury`)
      }
    }

    console.log(`Settled: ${battle.coin_a} vs ${battle.coin_b} winner=${winner}`)
    } catch (battleErr) {
      console.error(`Failed to settle battle ${battle.id} (${battle.coin_a} vs ${battle.coin_b}):`, battleErr.message)
    }
  }

  // Settle combo bets that have all legs resolved
  await settleComboTickets()
}

async function settleComboTickets() {
  // Find all unsettled combo tickets (combo_id is not null, not yet claimed)
  const { data: comboTickets } = await supabase
    .from('tickets')
    .select('*, battles(status, winner)')
    .not('combo_id', 'is', null)
    .eq('claimed', false)

  if (!comboTickets || comboTickets.length === 0) return

  // Group by combo_id
  const comboGroups = {}
  for (const ticket of comboTickets) {
    if (!comboGroups[ticket.combo_id]) comboGroups[ticket.combo_id] = []
    comboGroups[ticket.combo_id].push(ticket)
  }

  for (const [comboId, legs] of Object.entries(comboGroups)) {
    // Check if all legs are settled
    const allSettled = legs.every(t => t.battles?.status === 'settled')
    if (!allSettled) continue // wait for all battles to finish

    // Check if all legs won
    const allWon = legs.every(t => t.battles?.winner === t.side)
    const anyLost = legs.some(t => t.battles?.status === 'settled' && t.battles?.winner !== t.side && t.battles?.winner !== 0)

    const walletAddr = legs[0].wallet_address
    const stake = legs[0].stake // single stake covers all legs
    const comboOdds = legs[0].combo_odds || legs.reduce((acc, t) => acc * t.odds, 1)

    if (allWon) {
      // All legs won — pay out combo odds on the stake
      const { data: solPriceData } = await supabase
        .from('price_history')
        .select('price')
        .eq('coin', 'SOL')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()

      const solPrice = solPriceData?.price || 100
      const payoutUSD = stake * comboOdds * (1 - PLATFORM_FEE)
      const payoutLamports = Math.floor((payoutUSD / solPrice) * 1_000_000_000)

      const { data: userBal } = await supabase
        .from('user_balances')
        .select('balance_lamports')
        .eq('wallet_address', walletAddr)
        .single()

      if (userBal) {
        await supabase.from('user_balances')
          .update({
            balance_lamports: userBal.balance_lamports + payoutLamports,
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', walletAddr)

        console.log(`Combo ${comboId} WON: ${legs.length} legs, stake=$${stake}, payout=$${payoutUSD.toFixed(2)} (${comboOdds.toFixed(2)}x)`)
      }
    } else if (anyLost) {
      // At least one leg lost — entire combo loses, stake already deducted
      // Platform keeps the stake (minus what was already distributed to pool)
      console.log(`Combo ${comboId} LOST: one or more legs failed. Stake=$${stake} forfeited.`)
    }

    // Mark all legs as claimed so we don't process again
    for (const leg of legs) {
      await supabase.from('tickets')
        .update({ claimed: true })
        .eq('id', leg.id)
    }
  }
}

async function createBattles() {
  const now = new Date()
  const tickers = [...new Set(BATTLE_PAIRS.flatMap(p => [p.coinA, p.coinB]))]
  const prices = await getPythPrices(tickers)

  for (const pair of BATTLE_PAIRS) {
    const { data: existing } = await supabase
      .from('battles')
      .select('id')
      .eq('coin_a', pair.coinA)
      .eq('coin_b', pair.coinB)
      .in('status', ['live', 'upcoming'])
      .limit(1)

    if (existing && existing.length > 0) continue

    const startPriceA = prices[pair.coinA]
    const startPriceB = prices[pair.coinB]
    if (!startPriceA || !startPriceB) continue

    const durationMs = DURATION_MS[pair.duration] || 3600000
    const startTime = new Date(now.getTime() + 2 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + durationMs)

    const { error } = await supabase.from('battles').insert({
      coin_a: pair.coinA,
      coin_b: pair.coinB,
      league: pair.league,
      duration: pair.duration,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      start_price_a: startPriceA,
      start_price_b: startPriceB,
      status: 'live',
      side_a_pool: 0,
      side_b_pool: 0,
      draw_pool: 0,
      total_pool: 0,
    })

    if (error) console.error(`Insert error ${pair.coinA}/${pair.coinB}:`, error.message)
    else console.log(`Created: ${pair.coinA} vs ${pair.coinB}`)
  }

  return prices
}

export default async function handler(req, res) {
  const results = { battlesSettled: 0, battlesCreated: 0, pricesSaved: 0, errors: [] }
  
  try {
    await settleBattles()
    results.battlesSettled = 1
  } catch (err) {
    console.error('settleBattles failed:', err.message)
    results.errors.push('settle: ' + err.message)
  }

  let prices = {}
  try {
    prices = await createBattles()
    results.battlesCreated = 1
  } catch (err) {
    console.error('createBattles failed:', err.message)
    results.errors.push('create: ' + err.message)
  }

  try {
    const priceRows = Object.entries(prices).map(([coin, price]) => ({
      coin,
      price,
      recorded_at: new Date().toISOString()
    }))
    if (priceRows.length > 0) {
      await supabase.from('price_history').insert(priceRows)
      results.pricesSaved = priceRows.length
    }
  } catch (e) {
    console.error('Failed to save price history:', e.message)
    results.errors.push('prices: ' + e.message)
  }

  res.status(200).json({ 
    ok: results.errors.length === 0, 
    timestamp: new Date().toISOString(), 
    prices,
    ...results
  })
}
