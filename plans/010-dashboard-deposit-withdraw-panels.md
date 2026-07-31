# 010 — Animate the Deposit/Withdraw panel expand/collapse

- **Status**: DONE
- **Commit**: f32eaa5
- **Severity**: LOW
- **Category**: Preventing a jarring change
- **Estimated scope**: 1 file, 1 edit (two near-identical blocks)

## Problem

`UserBalancePanel`'s Deposit and Withdraw form panels snap open/closed
instantly — plain conditional renders with no transition.

`src/PredaLandingDashboardMockup.tsx:1454-1494` — current:

```tsx
      {showDeposit && (
        <div className="space-y-2">
          <input
            type="number"
            placeholder="Amount in SOL"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={handleDeposit}
            disabled={loading}
            className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: "var(--brand-grad)" }}
          >
            {loading ? 'Processing...' : 'Confirm Deposit'}
          </button>
        </div>
      )}

      {showWithdraw && (
        <div className="space-y-2">
          <input
            type="number"
            placeholder="Amount in SOL"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={handleWithdraw}
            disabled={loading}
            className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: "var(--brand-grad)" }}
          >
            {loading ? 'Processing...' : 'Confirm Withdraw'}
          </button>
        </div>
      )}
```

Scope note: this plan covers ONLY these two blocks (the SOL deposit/withdraw
panels toggled by `showDeposit`/`showWithdraw`). The separate Arc withdraw
panel (`showArcWithdraw`, elsewhere in this same component) is NOT part of
this plan — do not touch it.

## Target

Wrap each conditional in its own `AnimatePresence`, and turn each block's
outer `div` into a `motion.div` animating `height` (`0` → `auto`) and
`opacity` together, 220ms, the strong ease-out curve `[0.23, 1, 0.32, 1]`
already used for every other transition added to this app this session.
`overflow: hidden` is required so content doesn't spill out while `height`
is still animating.

```tsx
      <AnimatePresence initial={false}>
        {showDeposit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2">
              <input
                type="number"
                placeholder="Amount in SOL"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <button
                onClick={handleDeposit}
                disabled={loading}
                className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: "var(--brand-grad)" }}
              >
                {loading ? 'Processing...' : 'Confirm Deposit'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showWithdraw && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2">
              <input
                type="number"
                placeholder="Amount in SOL"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <button
                onClick={handleWithdraw}
                disabled={loading}
                className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: "var(--brand-grad)" }}
              >
                {loading ? 'Processing...' : 'Confirm Withdraw'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
```

The original `<div className="space-y-2">...</div>` in each block is kept
completely intact, one level deeper, inside the new `motion.div` wrapper —
every input, button, `value`, `onChange`, `onClick`, `disabled`, `className`,
and `style` inside it is untouched. Two separate `AnimatePresence` wrappers
are used (one per panel) since `showDeposit` and `showWithdraw` are
independent booleans, not a single shared toggle.

## Repo conventions to follow

- `motion` and `AnimatePresence` are already imported at the top of this
  file (`import { AnimatePresence, motion, ... } from "framer-motion";`,
  line 12) — no new import needed.
- Use `duration: 0.22, ease: [0.23, 1, 0.32, 1]` — the same curve used for
  every other transition added to this app this session, at the ~220ms
  duration requested for this specific opportunity.
- `initial={false}` on each `AnimatePresence` — these panels mount already
  collapsed (`showDeposit`/`showWithdraw` both start `false`), so there is
  no entrance to animate on first render, only the open/close toggle.

## Steps

1. Replace the block at lines 1454-1473 (`{showDeposit && (...)}`) with the
   first `AnimatePresence`/`motion.div`-wrapped version shown in Target,
   nesting the original `<div className="space-y-2">` (with its input and
   button completely unchanged) one level inside the new `motion.div`.
2. Replace the block at lines 1475-1494 (`{showWithdraw && (...)}`) with the
   second `AnimatePresence`/`motion.div`-wrapped version shown in Target,
   same nesting pattern.

## Boundaries

- Do NOT touch `handleDeposit`, `handleWithdraw`, `handleArcWithdraw`, any
  balance/amount math, `depositAmount`/`withdrawAmount` state or their
  `onChange` handlers, the `loading` state, or any transaction logic
  anywhere in this file.
- Do NOT touch `setShowDeposit`/`setShowWithdraw` themselves or the two
  toggle buttons below these blocks (lines 1496-1511) — only the two
  conditional panels' presentation changes.
- Do NOT touch the separate Arc withdraw panel (`showArcWithdraw`,
  elsewhere in this component) — out of scope for this plan.
- Do NOT touch any other part of this file.
- If the code at lines 1454-1494 no longer matches the excerpt above (drift
  since commit f32eaa5), or if wrapping these panels would require touching
  any of the logic listed above, STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors.
- **Feel check**: in the balance panel, click "Deposit" and confirm:
  - The deposit form eases open (height + fade) rather than snapping.
  - Clicking "Withdraw" while deposit is open closes the deposit panel and
    opens the withdraw panel — both transitions should ease, not snap, and
    the existing `setShowWithdraw(false)`/`setShowDeposit(false)`
    mutual-exclusivity behavior must be unchanged.
  - The input and button inside each panel work exactly as before (typing
    an amount, clicking Confirm) — nothing about their behavior changed.
- **Done when**: both panels animate via `AnimatePresence` and nothing else
  in the file changed.
