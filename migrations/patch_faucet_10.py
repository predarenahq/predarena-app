"""
Raises the Arc faucet from 2 to 10 USDC per claim, lifts the daily cap to 1000,
and puts the endpoint behind a session.

WHY THE AUTH IS NOT OPTIONAL HERE. /api/arc-faucet has never checked anything.
Its docstring says "dispenses testnet USDC to a logged-in user", but nothing
looked at a session, and the per-address cooldown is worthless against someone
generating addresses in a loop. The global cap was the only real limit, so the
cap was simply what a stranger could take per day. Going from 20 to 1000 would
have turned a 20/day hole into a 1000/day one.

So the claim now has to come from a session, and the address has to be one the
profile has LINKED. That makes the cooldown meaningful: it is checked across
every address on the profile, so a second linked wallet is not a second claim.
Generated addresses are useless because they belong to no profile.

Identity resolves the same two ways as /api/my-data, so this works whether the
caller has a wallet session cookie or only a Privy email token:
  (a) preda_session cookie, proven by wallet signature -> sessionFromToken
  (b) Privy email token -> email -> profile -> its linked addresses

sessionFromEmailToken already exists in my-data.mjs and is just made exportable
rather than copied. It belongs in session.mjs eventually; moving it there now
would mean editing the auth file every endpoint depends on, for no behaviour
change, so it stays where it is.

NOTE ON FUNDING. The cap is a ceiling, not a balance. The signing wallet held
about 20 USDC, which is two claims at the new size. Fund it from the grant
wallet before announcing this, or users will hit faucet_empty instead of
daily_cap_reached and assume the app is broken.

Safe by construction: every anchor verified to occur EXACTLY ONCE across the
three files before anything is written. Backs each up to .bak.

Run from repo root:  python3 migrations/patch_faucet_10.py
"""
import sys, os, shutil

EDITS = [
  # ---- let the faucet reuse the email-token resolver -----------------------
  ("api/my-data.mjs", [
    ("export email resolver",
     "async function sessionFromEmailToken(token) {",
     "export async function sessionFromEmailToken(token) {"),
  ]),

  # ---- the faucet itself ---------------------------------------------------
  ("api/arc-faucet.mjs", [
    ("faucet imports",
     "import { privateKeyToAccount } from 'viem/accounts'",
     "import { privateKeyToAccount } from 'viem/accounts'\n"
     "import { sessionFromToken, tokenFromReq } from './session.mjs'\n"
     "import { sessionFromEmailToken } from './my-data.mjs'"),

    ("faucet amounts",
     "const DRIP_WEI      = parseEther('2')   // 2 USDC per claim\n"
     "const DAILY_CAP_WEI = parseEther('20')  // total across ALL claimants per 24h",
     "const DRIP_WEI      = parseEther('10')    // 10 USDC per claim\n"
     "const DAILY_CAP_WEI = parseEther('1000')  // total across ALL claimants per 24h"),

    ("faucet docstring",
     " * Two limits:\n"
     " *   1. per address    - one claim per 24h\n"
     " *   2. global per day - the one that actually matters. A per-address cooldown\n"
     " *      alone is free money to anyone generating addresses in a loop; the daily\n"
     " *      ceiling bounds the worst case to a single refill of testnet funds.\n"
     " *\n"
     " * The signing key holds ~20 USDC and NOTHING else: it is not admin, not keeper,\n"
     " * not the quoter. If this endpoint is ever exploited, the loss is the wallet.",
     " * Three limits, in the order they matter:\n"
     " *   1. a session      - the caller must be signed in, and the address must be\n"
     " *      one their profile has linked. Without this the other two are theatre:\n"
     " *      a per-address cooldown costs an attacker nothing when addresses are\n"
     " *      free to generate, and the daily cap just becomes their daily budget.\n"
     " *   2. per profile    - one claim per 24h, checked across EVERY address on\n"
     " *      the profile, so linking a second wallet is not a second claim.\n"
     " *   3. global per day - the backstop, bounding a bad day to one refill.\n"
     " *\n"
     " * The signing key holds testnet funds and NOTHING else: it is not admin, not\n"
     " * keeper, not the quoter. If this endpoint is ever exploited, the loss is the\n"
     " * wallet. Keep it funded above the daily cap or users hit faucet_empty."),

    ("faucet auth + ownership + cooldown",
     "  try {\n"
     "    const since = new Date(Date.now() - COOLDOWN_MS).toISOString()\n"
     "\n"
     "    // 2. Per-address cooldown.\n"
     "    const { data: addrClaims } = await supabase\n"
     "      .from('arc_faucet_claims').select('created_at')\n"
     "      .eq('address', address).gte('created_at', since).limit(1)\n"
     "    if (addrClaims?.length) {\n"
     "      return res.status(429).json({ error: 'already_claimed', retry_after_hours: 24 })\n"
     "    }",
     "  try {\n"
     "    // 2. Who is asking? Same two routes as /api/my-data: a wallet-session\n"
     "    //    cookie, or a Privy email token for someone who has not signed with\n"
     "    //    a wallet this session.\n"
     "    const token = tokenFromReq(req)\n"
     "    let sess = await sessionFromToken(token)\n"
     "    if (!sess && token) sess = await sessionFromEmailToken(token)\n"
     "    if (!sess) return res.status(401).json({ error: 'not_signed_in' })\n"
     "\n"
     "    // 3. The address has to be one THIS profile has linked. This is the\n"
     "    //    check that gives the cooldown any force: an address nobody owns\n"
     "    //    cannot claim, so generating them in a loop buys nothing.\n"
     "    const owned = (sess.addresses || []).some(\n"
     "      (a) => String(a).toLowerCase() === address.toLowerCase()\n"
     "    )\n"
     "    if (!owned) return res.status(403).json({ error: 'address_not_linked' })\n"
     "\n"
     "    const since = new Date(Date.now() - COOLDOWN_MS).toISOString()\n"
     "\n"
     "    // 4. Per-PROFILE cooldown: every address on the profile, not just the\n"
     "    //    one being claimed to, or a second linked wallet doubles the drip.\n"
     "    const { data: addrClaims } = await supabase\n"
     "      .from('arc_faucet_claims').select('created_at')\n"
     "      .in('address', sess.addresses).gte('created_at', since).limit(1)\n"
     "    if (addrClaims?.length) {\n"
     "      return res.status(429).json({ error: 'already_claimed', retry_after_hours: 24 })\n"
     "    }"),

    ("renumber global cap",
     "    // 3. Global daily cap.",
     "    // 5. Global daily cap."),

    ("renumber balance check",
     "    // 4. Can we actually pay? Say so before promising anything.",
     "    // 6. Can we actually pay? Say so before promising anything."),

    ("renumber send",
     "    // 5. Send, wait, then record. Recording only after confirmation means a\n"
     "    //    failed send never burns the user's 24h window.",
     "    // 7. Send, wait, then record. Recording only after confirmation means a\n"
     "    //    failed send never burns the user's 24h window."),
  ]),

  # ---- the client has to actually send its credentials ---------------------
  ("src/components/ArcFaucetPanel.tsx", [
    ("panel imports",
     "import React, { useState } from 'react'\n"
     "import { Droplet, ExternalLink, Loader2, Check } from 'lucide-react'",
     "import React, { useState } from 'react'\n"
     "import { Droplet, ExternalLink, Loader2, Check } from 'lucide-react'\n"
     "import { useSession } from '../useSession'"),

    ("panel errors",
     "const ERRORS: Record<string, string> = {\n"
     "  already_claimed:   'You already claimed in the last 24 hours',",
     "const ERRORS: Record<string, string> = {\n"
     "  not_signed_in:     'Sign in to claim test USDC',\n"
     "  address_not_linked:'Link this wallet to your account first, then claim',\n"
     "  already_claimed:   'You already claimed in the last 24 hours',"),

    ("panel drip constant",
     "const LOW_BALANCE = 2",
     "// One number the copy reads from. The strings used to hardcode \"2 USDC\" in\n"
     "// three places, so raising the drip silently left the button promising the\n"
     "// old amount while the server sent the new one.\n"
     "const DRIP_USDC = 10\n"
     "const LOW_BALANCE = DRIP_USDC"),

    ("panel doc amount",
     " * empty wallet can do nothing at all, not even approve. This dispenses 2 USDC\n",
     " * empty wallet can do nothing at all, not even approve. This dispenses DRIP_USDC\n"),

    ("panel verified note",
     " * gas AND as bettable USDC. Verified: 2.0 native / 2000000 ERC-20 from one tx.",
     " * gas AND as bettable USDC. Verified: one native send lands as both."),

    ("panel compact label",
     "        {claiming ? 'Sending\u2026' : done ? 'Sent 2 USDC' : 'Get test USDC'}",
     "        {claiming ? 'Sending\u2026' : done ? `Sent ${DRIP_USDC} USDC` : 'Get test USDC'}"),

    ("panel headline",
     "            {done ? '2 USDC sent' : 'You need test USDC'}",
     "            {done ? `${DRIP_USDC} USDC sent` : 'You need test USDC'}"),

    ("panel cta",
     "            {claiming ? 'Sending\u2026' : done ? 'Sent' : 'Send me 2 USDC'}",
     "            {claiming ? 'Sending\u2026' : done ? 'Sent' : `Send me ${DRIP_USDC} USDC`}"),

    ("panel state",
     "  const [claiming, setClaiming] = useState(false)",
     "  const { readToken } = useSession()\n"
     "  const [claiming, setClaiming] = useState(false)"),

    ("panel fetch",
     "      const res = await fetch('/api/arc-faucet', {\n"
     "        method: 'POST',\n"
     "        headers: { 'Content-Type': 'application/json' },\n"
     "        body: JSON.stringify({ address }),\n"
     "      })",
     "      // The wallet session rides the httpOnly cookie, so credentials must be\n"
     "      // sent; the Privy token is the fallback identity for an email-only user\n"
     "      // who has not signed with a wallet this session. Same pair as my-data.\n"
     "      const headers: Record<string, string> = { 'Content-Type': 'application/json' }\n"
     "      if (readToken) headers.Authorization = `Bearer ${readToken}`\n"
     "      const res = await fetch('/api/arc-faucet', {\n"
     "        method: 'POST',\n"
     "        headers,\n"
     "        credentials: 'same-origin',\n"
     "        body: JSON.stringify({ address }),\n"
     "      })"),
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
    print("10 USDC per claim, 1000/day across everyone, session required, and the")
    print("address must be linked to the claiming profile.")
    print("")
    print("BEFORE YOU ANNOUNCE IT: fund the faucet wallet. The cap is a ceiling,")
    print("not a balance - at ~20 USDC it holds two claims, and the third user")
    print("gets faucet_empty. Check it with the address behind")
    print("ARC_FAUCET_PRIVATE_KEY in Vercel, and top it up from the grant wallet.")


if __name__ == "__main__":
    main()
