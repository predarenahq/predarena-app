#!/usr/bin/env python3
"""
Closes the deposit retry hole: when a deposit hasn't reached finality (the 202
path), record its signature in pending_deposits so the cron sweep can credit it
later. Without this, a deposit is lost if the user's browser gives up.

Safe: verifies the anchor exists exactly once, backs up to api/deposit.mjs.bak,
aborts clean on mismatch. Run from repo root: python3 migrations/patch_deposit.py
"""
import sys, os, shutil

PATH = "api/deposit.mjs"
ANCHOR = "    if (!tx) return res.status(202).json({ error: 'deposit_pending', signature })"
REPLACEMENT = (
    "    if (!tx) {\n"
    "      // Finality not reached before the request returned. Record the\n"
    "      // signature so the cron sweep credits it once it confirms — otherwise\n"
    "      // the deposit is lost if the tab closes. upsert with ignoreDuplicates\n"
    "      // makes repeated 202s idempotent (signature is the PK).\n"
    "      await supabase.from('pending_deposits').upsert(\n"
    "        { signature, wallet_address },\n"
    "        { onConflict: 'signature', ignoreDuplicates: true }\n"
    "      )\n"
    "      return res.status(202).json({ error: 'deposit_pending', signature })\n"
    "    }"
)

def main():
    if not os.path.exists(PATH):
        print(f"ERROR: {PATH} not found. Run from repo root."); sys.exit(1)
    src = open(PATH).read()
    n = src.count(ANCHOR)
    if n != 1:
        print(f"ABORTED — anchor found {n} times (expected 1). No changes written.")
        print("Your 202 line differs from what's expected. Paste it and it can be adjusted.")
        sys.exit(1)
    shutil.copy(PATH, PATH + ".bak")
    open(PATH, "w").write(src.replace(ANCHOR, REPLACEMENT, 1))
    print(f"Patched {PATH} (backup at {PATH}.bak)")
    print("The 202 path now writes to pending_deposits — the sweep has something to drain.")

if __name__ == "__main__":
    main()
