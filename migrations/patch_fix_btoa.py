#!/usr/bin/env python3
"""
Fixes TS2802: String.fromCharCode(...sigBytes) spreads a Uint8Array, which the
project's TS target won't iterate. Replace the spread with an index loop that
builds the binary string without iteration. Same base64 output.

Safe: single anchor, backup to .bak, abort on mismatch.
Run from repo root: python3 migrations/patch_fix_btoa.py
"""
import sys, os, shutil
PATH = "src/PredaLandingDashboardMockup.tsx"
ANCHOR = "      const signature = btoa(String.fromCharCode(...sigBytes))"
REPL = (
    "      let binary = ''\n"
    "      for (let i = 0; i < sigBytes.length; i++) binary += String.fromCharCode(sigBytes[i])\n"
    "      const signature = btoa(binary)"
)
def main():
    if not os.path.exists(PATH):
        print(f"ERROR: {PATH} not found."); sys.exit(1)
    s = open(PATH).read()
    n = s.count(ANCHOR)
    if n != 1:
        print(f"ABORTED — anchor found {n} times (expected 1). No changes written.")
        sys.exit(1)
    shutil.copy(PATH, PATH + ".bak")
    open(PATH, "w").write(s.replace(ANCHOR, REPL, 1))
    print(f"Patched {PATH} — spread replaced with index loop. Commit + push.")
if __name__ == "__main__":
    main()
