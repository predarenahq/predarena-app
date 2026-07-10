#!/usr/bin/env python3
"""
Wires the fixed-odds settlement, deposit sweep, solvency monitor, base-prob
population, and cron auth into api/cron.mjs.

Safe by construction: verifies every anchor exists EXACTLY ONCE before making
any change. If an anchor is missing (e.g. your cron.mjs drifted from what we
read), it aborts and writes nothing, telling you which anchor failed. Backs up
to api/cron.mjs.bak.

Run from your repo root:  python3 migrations/patch_cron.py
"""
import sys, os, shutil

PATH = "api/cron.mjs"

# (label, anchor, replacement)
EDITS = [
    # 1. Imports — appended right after the supabase-js import.
    ("imports",
     "import { createClient } from '@supabase/supabase-js'",
     "import { createClient } from '@supabase/supabase-js'\n"
     "import { settleBattles as settleBattlesFixed } from './lib/settlement.mjs'\n"
     "import { getStartingProbs } from './lib/oddsEngine.mjs'\n"
     "import { sweepPendingDeposits, assertSolvency, getVaultLamports } from './lib/cronHelpers.mjs'\n"
     "import { verifyDeposit } from './lib/verifyDeposit.mjs'"),

    # 2. Auth guard + swap to the fixed-odds settler.
    ("handler auth + settle swap",
     "export default async function handler(req, res) {\n"
     "  const results = { battlesSettled: 0, battlesCreated: 0, pricesSaved: 0, errors: [] }\n"
     "  \n"
     "  try {\n"
     "    const payoutFailures = await settleBattles()",
     "export default async function handler(req, res) {\n"
     "  // Cron auth. cron-job.org sends this header. If CRON_SECRET is unset we\n"
     "  // fail OPEN with a warning so deploying this patch doesn't break the cron\n"
     "  // before you add the env var — set CRON_SECRET to enforce.\n"
     "  if (process.env.CRON_SECRET) {\n"
     "    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {\n"
     "      return res.status(401).json({ error: 'unauthorized' })\n"
     "    }\n"
     "  } else {\n"
     "    console.warn('⚠️ CRON_SECRET not set — cron endpoint is UNAUTHENTICATED')\n"
     "  }\n"
     "\n"
     "  const results = { battlesSettled: 0, battlesCreated: 0, pricesSaved: 0, errors: [] }\n"
     "  \n"
     "  try {\n"
     "    const payoutFailures = await settleBattlesFixed({ supabase, getPythPrices })"),

    # 3. Populate base probs on battle creation (volatility-aware even at 0 momentum).
    ("createBattles base probs",
     "    if (!startPriceA || !startPriceB) continue\n",
     "    if (!startPriceA || !startPriceB) continue\n"
     "\n"
     "    // Base probabilities stored on the battle so in-play pricing is\n"
     "    // deterministic. Volatility-aware even with neutral momentum.\n"
     "    const baseProbs = getStartingProbs(pair.coinA, pair.coinB, 0, 0)\n"),

    ("base prob insert fields",
     "      status: 'live',\n"
     "      side_a_pool: 0,",
     "      status: 'live',\n"
     "      base_prob_a: baseProbs.probA,\n"
     "      base_prob_b: baseProbs.probB,\n"
     "      base_prob_draw: baseProbs.probDraw,\n"
     "      side_a_pool: 0,"),

    # 4. Deposit sweep + solvency monitor, just before the final response.
    ("sweep + solvency",
     "  res.status(200).json({ \n"
     "    ok: results.errors.length === 0, ",
     "  // Deposit retry backstop: credit deposits that missed browser finality.\n"
     "  try {\n"
     "    const sweep = await sweepPendingDeposits({ supabase, verifyDeposit })\n"
     "    results.depositsSwept = sweep.swept\n"
     "    results.depositsCredited = sweep.credited\n"
     "    if (sweep.failures?.length) results.errors.push('sweep: ' + sweep.failures.length + ' failed')\n"
     "  } catch (e) {\n"
     "    console.error('sweep failed:', e.message)\n"
     "    results.errors.push('sweep: ' + e.message)\n"
     "  }\n"
     "\n"
     "  // Read-only solvency monitor. Alerts if the vault can't cover claims.\n"
     "  try {\n"
     "    const solMap = await getPythPrices(['SOL'])\n"
     "    const solPrice = solMap['SOL']\n"
     "    if (solPrice > 0) {\n"
     "      const vaultLamports = await getVaultLamports(process.env.SOLANA_RPC_URL)\n"
     "      results.solvency = await assertSolvency({ supabase, vaultLamports, solPrice })\n"
     "    }\n"
     "  } catch (e) {\n"
     "    console.error('solvency check failed:', e.message)\n"
     "  }\n"
     "\n"
     "  res.status(200).json({ \n"
     "    ok: results.errors.length === 0, "),
]

def main():
    if not os.path.exists(PATH):
        print(f"ERROR: {PATH} not found. Run from your repo root.")
        sys.exit(1)
    src = open(PATH).read()

    # Verify every anchor exactly once BEFORE changing anything.
    problems = []
    for label, anchor, _ in EDITS:
        n = src.count(anchor)
        if n != 1:
            problems.append(f"  [{label}] anchor found {n} times (expected 1)")
    if problems:
        print("ABORTED — no changes written. Anchor mismatch:")
        print("\n".join(problems))
        print("\nYour cron.mjs differs from what the patch expects. Paste the relevant")
        print("section and it can be adjusted.")
        sys.exit(1)

    shutil.copy(PATH, PATH + ".bak")
    out = src
    for _, anchor, repl in EDITS:
        out = out.replace(anchor, repl, 1)
    open(PATH, "w").write(out)
    print(f"Patched {PATH} (backup at {PATH}.bak)")
    print("Applied: imports, cron auth, fixed-odds settler, base probs, sweep, solvency.")
    print("\nNext: `node --check api/cron.mjs`, then delete the now-dead old")
    print("settleBattles()/settleComboTickets() definitions when you're ready.")

if __name__ == "__main__":
    main()
