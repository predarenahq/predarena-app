#!/usr/bin/env python3
"""
Sets DRAW_THRESHOLD to 0 in api/lib/settlement.mjs — a battle is only a draw on
an EXACT tie. The old 0.1% band called clear winners (e.g. +0.21% vs +0.12%)
draws, which silently swept most bets to the house.

Safe: verifies the anchor once, backs up to .bak, aborts clean on mismatch.
Run from repo root: python3 migrations/patch_draw_threshold.py
"""
import sys, os, shutil
PATH = "api/lib/settlement.mjs"
ANCHOR = "const DRAW_THRESHOLD = 0.001"
REPL = "const DRAW_THRESHOLD = 0 // exact tie only; any measurable move picks a winner"

def main():
    if not os.path.exists(PATH):
        print(f"ERROR: {PATH} not found. Run from repo root."); sys.exit(1)
    s = open(PATH).read()
    n = s.count(ANCHOR)
    if n != 1:
        print(f"ABORTED — anchor found {n} times (expected 1). No changes written.")
        print("Your DRAW_THRESHOLD line differs. Paste it and it can be adjusted.")
        sys.exit(1)
    shutil.copy(PATH, PATH + ".bak")
    open(PATH, "w").write(s.replace(ANCHOR, REPL, 1))
    print(f"Patched {PATH} (backup at {PATH}.bak)")
    print("Draws now require an exact tie. Commit + push to deploy.")

if __name__ == "__main__":
    main()
