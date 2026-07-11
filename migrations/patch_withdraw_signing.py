#!/usr/bin/env python3
"""
Adds wallet-signature signing to the client withdraw flow so the hardened
withdraw.mjs (which requires a signed message) actually works. Two edits:
  1. destructure signMessage from useWallet()
  2. sign the exact message the server verifies, send it in the POST body

Uses browser-native base64 (btoa) — no Buffer/bs58 (neither is imported).

Safe: verifies each anchor exactly once, backs up to .bak, aborts on mismatch.
Run from repo root: python3 migrations/patch_withdraw_signing.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"

EDITS = [
  ("destructure signMessage",
   "  const { publicKey, connected, sendTransaction } = useWallet()",
   "  const { publicKey, connected, sendTransaction, signMessage } = useWallet()"),

  ("withdraw signing",
   "      const res = await fetch('/api/withdraw', {\n"
   "        method: 'POST',\n"
   "        headers: { 'Content-Type': 'application/json' },\n"
   "        body: JSON.stringify({\n"
   "          wallet_address: walletAddr,\n"
   "          amount_lamports: lamports,\n"
   "        })\n"
   "      })",
   "      // The server requires proof the caller owns this wallet. Ask the\n"
   "      // wallet to sign a message naming the amount + destination, then send\n"
   "      // it along. base64 via btoa (no Buffer in the browser bundle).\n"
   "      if (!signMessage) {\n"
   "        throw new Error('Your wallet does not support message signing')\n"
   "      }\n"
   "      const message = `PredArena withdraw ${lamports} to ${walletAddr} at ${Date.now()}`\n"
   "      const sigBytes = await signMessage(new TextEncoder().encode(message))\n"
   "      const signature = btoa(String.fromCharCode(...sigBytes))\n"
   "\n"
   "      const res = await fetch('/api/withdraw', {\n"
   "        method: 'POST',\n"
   "        headers: { 'Content-Type': 'application/json' },\n"
   "        body: JSON.stringify({\n"
   "          wallet_address: walletAddr,\n"
   "          amount_lamports: lamports,\n"
   "          signature,\n"
   "          message,\n"
   "        })\n"
   "      })"),
]

def main():
    if not os.path.exists(PATH):
        print(f"ERROR: {PATH} not found. Run from repo root."); sys.exit(1)
    s = open(PATH).read()
    problems = []
    for label, anchor, _ in EDITS:
        n = s.count(anchor)
        if n != 1:
            problems.append(f"  [{label}] anchor found {n} times (expected 1)")
    if problems:
        print("ABORTED — no changes written:")
        print("\n".join(problems)); sys.exit(1)
    shutil.copy(PATH, PATH + ".bak")
    for _, anchor, repl in EDITS:
        s = s.replace(anchor, repl, 1)
    open(PATH, "w").write(s)
    print(f"Patched {PATH} (backup at {PATH}.bak)")
    print("Client now signs withdrawals. signMessage destructured; message signed + sent.")

if __name__ == "__main__":
    main()
