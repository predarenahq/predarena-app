#!/usr/bin/env python3
"""
Retires the un-spendable PDA and points deposits + withdrawals at ONE custodial
hot wallet (env: PLATFORM_VAULT_ADDRESS). This is the fix for the core bug:
deposits were landing in a program-derived account that has no instruction to
send funds back out, while withdrawals paid from a different keypair. One
address for both directions, read from a single env var so they can never drift.

Patches three files:
  * src/PredaLandingDashboardMockup.tsx  — deposit sends to the wallet, not PDA
  * api/deposit.mjs                      — verify against the wallet, not PDA
  * api/withdraw.mjs                     — (handled by patch_withdraw.py separately)

Safe: verifies every anchor exactly once before writing; backs up each file to
.bak; aborts clean on any mismatch. Run from repo root:
    python3 migrations/patch_vault_address.py
"""
import sys, os, shutil

EDITS = [
  # --- client deposit: replace PDA derivation + toPubkey with the env wallet ---
  ("src/PredaLandingDashboardMockup.tsx",
   [
     ("client PDA derive",
      "      const [vaultPda] = PublicKey.findProgramAddressSync(\n"
      "        [Buffer.from('platform_vault')],\n"
      "        PROGRAM_ID\n"
      "      )",
      "      // Custodial vault: one hot wallet holds user SOL. Deposits and\n"
      "      // withdrawals use this same address. Set via env at build time.\n"
      "      const vaultAddress = new PublicKey(\n"
      "        process.env.REACT_APP_PLATFORM_VAULT_ADDRESS ||\n"
      "        '5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V'\n"
      "      )"),
     ("client toPubkey",
      "          toPubkey: vaultPda,",
      "          toPubkey: vaultAddress,"),
   ]),

  # --- server deposit verify: replace PDA with the env wallet ---
  ("api/deposit.mjs",
   [
     ("server PDA derive",
      "const [VAULT_PDA] = PublicKey.findProgramAddressSync(\n"
      "  [Buffer.from('platform_vault')],\n"
      "  PROGRAM_ID\n"
      ")",
      "// Custodial vault hot wallet — the single address deposits land in and\n"
      "// withdrawals pay from. One source of truth so the two can't diverge.\n"
      "const VAULT_ADDRESS = new PublicKey(\n"
      "  process.env.PLATFORM_VAULT_ADDRESS || '5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V'\n"
      ")"),
     ("server vaultIndex",
      "    const vaultIndex = keys.findIndex((k) => k.equals(VAULT_PDA))",
      "    const vaultIndex = keys.findIndex((k) => k.equals(VAULT_ADDRESS))"),
   ]),
]

def main():
    # verify all anchors first, across all files, before any write
    problems = []
    contents = {}
    for path, edits in EDITS:
        if not os.path.exists(path):
            problems.append(f"  {path}: file not found"); continue
        s = open(path).read(); contents[path] = s
        for label, anchor, _ in edits:
            n = s.count(anchor)
            if n != 1:
                problems.append(f"  [{path} :: {label}] anchor found {n} times (expected 1)")
    if problems:
        print("ABORTED — no changes written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    for path, edits in EDITS:
        shutil.copy(path, path + ".bak")
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        open(path, "w").write(s)
        print(f"Patched {path} (backup at {path}.bak)")
    print("\nDeposits + withdrawals now target the custodial wallet.")
    print("Set PLATFORM_VAULT_ADDRESS (server) and REACT_APP_PLATFORM_VAULT_ADDRESS")
    print("(client) in Vercel = 5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V")

if __name__ == "__main__":
    main()
