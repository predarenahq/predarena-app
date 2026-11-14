"""
Points the three remaining PDA readers at the custodial vault wallet.

patch_vault_address.py moved DEPOSITS and the CLIENT to the hot wallet
(5GD6Yv...) but left three files deriving the retired program PDA
(GAXNFpYwA3sYZs1MXKX1xeDN9tH7hZutDZtAatiDvCAT). That is not cosmetic:

  lib/verifyDeposit.mjs  - the cron sweep verifies pending deposits against the
                           PDA, finds no vault credit, calls them 'invalid' and
                           DELETES the pending_deposits row. The SOL is sitting
                           in the real vault and the record is gone. Every
                           deposit that missed the 40s finality window is lost
                           this way.
  lib/cronHelpers.mjs    - the solvency monitor measures an account nobody pays
                           from, so the underwater alarm means nothing.
  api/place-bet.mjs      - p_vault_lamports feeds the SQL solvency gate, so bets
                           are accepted or rejected against the wrong balance.

All three now read PLATFORM_VAULT_ADDRESS, the same env var depositHandler uses.
One source of truth so they cannot drift apart again.

Safe by construction: every anchor is verified to occur EXACTLY ONCE across all
three files before anything is written. Any mismatch aborts with nothing
changed. Each file is backed up to .bak.

Run from repo root:  python3 migrations/patch_vault_sweep.py
"""
import sys, os, shutil

VAULT_CONST = (
    "// Custodial vault hot wallet - the single address deposits land in and\n"
    "// withdrawals pay from. Same env var as lib/depositHandler.mjs, on purpose:\n"
    "// these two reading different accounts is what silently deleted deposits.\n"
    "const VAULT_ADDRESS = new PublicKey(\n"
    "  process.env.PLATFORM_VAULT_ADDRESS || '5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V'\n"
    ")"
)

EDITS = [
  ("lib/verifyDeposit.mjs", [
    ("verifyDeposit vault const",
     "const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')\n"
     "\n"
     "const [VAULT_PDA] = PublicKey.findProgramAddressSync(\n"
     "  [Buffer.from('platform_vault')],\n"
     "  PROGRAM_ID\n"
     ")",
     VAULT_CONST),
    ("verifyDeposit vaultIndex",
     "  const vaultIndex = keys.findIndex((k) => k.equals(VAULT_PDA))",
     "  const vaultIndex = keys.findIndex((k) => k.equals(VAULT_ADDRESS))"),
  ]),

  ("lib/cronHelpers.mjs", [
    ("cronHelpers vault const",
     "const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')\n"
     "const [VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from('platform_vault')], PROGRAM_ID)",
     VAULT_CONST),
    ("cronHelpers getBalance",
     "  return await connection.getBalance(VAULT_PDA)",
     "  return await connection.getBalance(VAULT_ADDRESS)"),

    # The sweep must stop hard-deleting rows it cannot credit. With the wrong
    # vault address this branch erased real deposits; with the right one it can
    # still erase a deposit on any future verifier bug. Park, never delete.
    ("cronHelpers skip parked",
     "  for (const row of rows) {\n"
     "    try {\n"
     "      const v = await verifyDeposit(row.signature, row.wallet_address, { attempts: 2, delayMs: 1500 })",
     "  for (const row of rows) {\n"
     "    // Already parked for review by the branch below. Don't re-verify it\n"
     "    // every minute forever, and don't let it count as swept.\n"
     "    if (String(row.last_error || '').startsWith('invalid:')) continue\n"
     "    try {\n"
     "      const v = await verifyDeposit(row.signature, row.wallet_address, { attempts: 2, delayMs: 1500 })"),

    ("cronHelpers park not delete",
     "      } else if (v.status === 'invalid') {\n"
     "        // Will never succeed (failed tx, not a vault deposit, signer mismatch).\n"
     "        console.error(`sweep: dropping invalid pending deposit ${row.signature}: ${v.reason}`)\n"
     "        await supabase.from('pending_deposits').delete().eq('signature', row.signature)",
     "      } else if (v.status === 'invalid') {\n"
     "        // A deposit we cannot credit is still money a user sent us. Park it\n"
     "        // for a human instead of deleting it: DELETE here is exactly how the\n"
     "        // wrong-vault bug made real deposits disappear with no record.\n"
     "        console.error(`sweep: PARKED uncreditable deposit ${row.signature}: ${v.reason}`)\n"
     "        await supabase.from('pending_deposits')\n"
     "          .update({ last_error: 'invalid: ' + v.reason, checked_at: new Date().toISOString() })\n"
     "          .eq('signature', row.signature)"),
  ]),

  ("api/place-bet.mjs", [
    ("place-bet vault const",
     "const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')\n"
     "const [VAULT_PDA] = PublicKey.findProgramAddressSync([Buffer.from('platform_vault')], PROGRAM_ID)",
     VAULT_CONST),
    ("place-bet getBalance",
     "  return await connection.getBalance(VAULT_PDA)",
     "  return await connection.getBalance(VAULT_ADDRESS)"),
  ]),
]


def main():
    problems, contents = [], {}
    for path, edits in EDITS:
        if not os.path.exists(path):
            problems.append("  %s: file not found (run from repo root)" % path)
            continue
        s = open(path).read()
        contents[path] = s
        for label, anchor, _ in edits:
            n = s.count(anchor)
            if n != 1:
                problems.append("  [%s :: %s] anchor found %d times (expected 1)" % (path, label, n))

    if problems:
        print("ABORTED - nothing written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    for path, edits in EDITS:
        shutil.copy(path, path + ".bak")
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        open(path, "w").write(s)
        print("Patched %s (backup at %s.bak)" % (path, path))

    print("")
    print("Deposits, the sweep, the solvency monitor and the bet gate now read")
    print("ONE address: PLATFORM_VAULT_ADDRESS (default 5GD6Yv...).")
    print("")
    print("Before you deploy, check both balances:")
    print("  solana balance 5GD6YvnQeTLC1W1xYCD6jPzvg5vcn4wC5JZvKV4nsD3V --url devnet")
    print("  solana balance GAXNFpYwA3sYZs1MXKX1xeDN9tH7hZutDZtAatiDvCAT --url devnet")
    print("If the PDA holds SOL, that is old deposit money stranded in an account")
    print("with no withdraw instruction. The gate has been sizing bets against it.")


if __name__ == "__main__":
    main()
