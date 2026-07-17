import { depositHandler }  from '../lib/depositHandler.mjs'
import { withdrawHandler } from '../lib/withdrawHandler.mjs'

/**
 * Deposit and withdraw behind one function.
 *
 * Not a rewrite: both handlers moved to lib/ untouched and are dispatched here.
 * They already shared the custodial vault, the service-role client and the SOL
 * feed - only the boilerplate was duplicated. The Hobby plan caps Serverless
 * Functions at 12 and we were at 11, so this buys the slot /api/admin-stats
 * needs without touching the quote endpoints, which are the one part of the Arc
 * stack that is provably correct (typehash and legsHash verified against the
 * deployed contract) and therefore the last thing worth refactoring for space.
 *
 * NOTE: the merged function MUST keep a maxDuration >= withdraw's old 30. It
 * also fixes a latent deposit bug - deposit polls finality for ~40s but had NO
 * maxDuration entry, so it ran at the default and was killed mid-loop. The kill
 * skips the pending_deposits fallback on line ~47, which exists precisely so a
 * slow deposit is not lost. Same shape as the arc-keeper timeout: function
 * killed, catch never runs, state stranded.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const action = req.body?.action
  if (action === 'deposit')  return depositHandler(req, res)
  if (action === 'withdraw') return withdrawHandler(req, res)
  return res.status(400).json({ error: 'invalid_action' })
}
