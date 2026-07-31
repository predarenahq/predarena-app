# 009 — Give BattleDetailPage's toast an enter/exit transition

- **Status**: DONE
- **Commit**: 5fd646b
- **Severity**: LOW
- **Category**: Preventing a jarring change
- **Estimated scope**: 1 file, 1 edit

## Problem

The toast notification hard mounts/unmounts with zero transition — it just
appears and vanishes at `position: fixed; bottom: 24`.

`src/BattleDetailPage.tsx:793-804` — current:

```tsx
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? 'rgba(4,120,87,0.95)' : 'rgba(220,38,38,0.95)',
          color: 'white', padding: '12px 24px', borderRadius: 12, fontWeight: 600,
          fontSize: 14, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          maxWidth: '90vw', textAlign: 'center',
        }}>
          {toast.msg}
        </div>
      )}
```

Note the existing `transform: 'translateX(-50%)'` — this is load-bearing
horizontal centering (the element has no fixed width, so it centers itself
by shifting back half its own rendered width). Any animated transform added
here must compose with this, not replace it.

## Target

Wrap the conditional in `AnimatePresence` and turn the `div` into a
`motion.div`, combining the existing horizontal-centering `translateX(-50%)`
with an animated vertical `translateY` in a single `transform` string (this
app's established pattern from earlier this session, rather than
Framer Motion's separate `x`/`y` shorthands, to keep the centering and the
animated offset as one coherent value). Enter/exit both slide vertically +
fade, 200ms, the strong ease-out curve `[0.23, 1, 0.32, 1]` already used for
every other transition added to this app this session.

```tsx
      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ transform: 'translateX(-50%) translateY(20px)', opacity: 0 }}
            animate={{ transform: 'translateX(-50%) translateY(0px)', opacity: 1 }}
            exit={{ transform: 'translateX(-50%) translateY(20px)', opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: 'fixed', bottom: 24, left: '50%',
              background: toast.type === 'success' ? 'rgba(4,120,87,0.95)' : 'rgba(220,38,38,0.95)',
              color: 'white', padding: '12px 24px', borderRadius: 12, fontWeight: 600,
              fontSize: 14, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              maxWidth: '90vw', textAlign: 'center',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
```

Note `transform` moved out of the plain `style` object and into the
`initial`/`animate`/`exit` props (Framer Motion needs to own the animated
property to interpolate it) — every other style property (`position`,
`bottom`, `left`, `background`, `color`, `padding`, `borderRadius`,
`fontWeight`, `fontSize`, `zIndex`, `boxShadow`, `maxWidth`, `textAlign`)
stays in `style`, completely unchanged, including the `toast.type === 'success' ? ... : ...`
color values (which were already fixed for contrast earlier this session —
not to be touched again here).

## Repo conventions to follow

- `src/BattleDetailPage.tsx` does not currently import anything from
  `framer-motion` — add `import { motion, AnimatePresence } from 'framer-motion'`
  as a new import line. `framer-motion` is already a project dependency,
  used throughout `src/components/BetShareModal.tsx`,
  `src/components/PriceChartModal.tsx`, `src/PublicProfilePage.tsx`, and
  `src/NewsPage.tsx`.
- Use `duration: 0.2, ease: [0.23, 1, 0.32, 1]` — the same curve used for
  every other transition added to this app this session (modal backdrops,
  the news accordion). Do not invent a different curve.
- Compose the animated transform as a single literal `transform` string
  (`'translateX(-50%) translateY(...)'`), matching how this session already
  handled combined transform values in `src/components/BetShareModal.tsx`
  and `src/components/PriceChartModal.tsx`, rather than Framer Motion's
  separate `x`/`y` shorthand props.

## Steps

1. In `src/BattleDetailPage.tsx`, add `import { motion, AnimatePresence } from 'framer-motion'`
   as a new import line (after the existing
   `import { ArcSide } from './arc/contracts'` line).
2. Replace the block at lines 793-804 (`{/* Toast notification */}` through
   the closing `)}`) with the Target markup above: wrap `{toast && (...)}`
   in `<AnimatePresence>`, change the `div` to a `motion.div` with the
   `initial`/`animate`/`exit`/`transition` props shown, move `transform` out
   of `style` and into those props, and leave every other style property
   and `{toast.msg}` exactly as they are.

## Boundaries

- Do NOT touch `handlePlaceBet`, `handlePlaceBetArc`, the `toast` state
  (`useState`), `showToast`, the `setTimeout(() => setToast(null), 5000)`
  auto-dismiss timer, or any bet/balance/odds logic anywhere in this file.
- Do NOT change the toast's message content, its success/error color
  values, or any style property other than moving `transform` into the
  animation props.
- Do NOT touch any other part of this file (the header, chart, betting
  panel, side-selection, or any other section).
- If the block at lines 793-804 no longer matches the excerpt above (drift
  since commit 5fd646b), or if making this change would require touching
  `showToast`, the toast state, or any bet/balance/wallet logic, STOP and
  report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors.
- **Feel check**: trigger a toast (e.g. add a pick to the slip, or hit a bet
  validation error) and confirm:
  - The toast slides up + fades in from below, and slides down + fades out
    on dismiss — no instant pop in either direction.
  - It stays horizontally centered throughout (the `translateX(-50%)`
    centering must not visibly shift or break at any point in the
    animation).
  - The 5-second auto-dismiss timing is unchanged (still ~5s from
    `showToast`, unaffected by the 200ms enter/exit animation).
- **Done when**: the toast enters/exits via `AnimatePresence`, stays
  correctly centered, and nothing else in the file changed.
