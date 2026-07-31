# 002 — Make modal panel entrances GPU-safe and consistent across files

- **Status**: DONE
- **Commit**: 56fe27b
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files, 2 edits

## Problem

Both modal panels animate with Framer Motion's `scale`/`y` shorthand props.
Per AUDIT.md §5, these shorthands are not hardware-accelerated the way a
literal `transform` CSS string is — they run on the main thread and can drop
frames under load. On top of that, the two panels implement the *same*
interaction (a modal appearing) two different ways: `BetShareModal.tsx` has a
hand-tuned spring, while `PriceChartModal.tsx` has no `transition` prop at
all and silently falls back to Framer Motion's internal default for a mix of
`scale`+`opacity` — a cohesion gap (AUDIT.md §7) layered on top of the
performance issue.

`src/components/BetShareModal.tsx:135-143` — current:

```tsx
<motion.div
  initial={{ scale: 0.96, opacity: 0, y: 8 }}
  animate={{ scale: 1, opacity: 1, y: 0 }}
  exit={{ scale: 0.96, opacity: 0, y: 8 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  className="relative w-full max-w-md rounded-[22px] overflow-hidden"
  style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}`, boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 24px 60px rgba(0,240,255,0.10)' }}
  onClick={e => e.stopPropagation()}
>
```

`src/components/PriceChartModal.tsx:127-134` — current:

```tsx
<motion.div
  initial={{ scale: 0.95, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  exit={{ scale: 0.95, opacity: 0 }}
  className="w-full max-w-2xl rounded-2xl p-6"
  style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}
  onClick={e => e.stopPropagation()}
>
```

## Target

Replace the `scale`/`y` motion-value shorthands with a single literal
`transform` string per keyframe (Framer Motion animates `transform` as a
plain CSS string just as well as it animates the shorthand keys, and
`AnimatePresence` exit tracking works identically). Keep `opacity` as its own
key. Give `PriceChartModal.tsx` the same explicit spring
`BetShareModal.tsx` already uses, instead of an undocumented default, so both
modals in this app open with identical physics.

`src/components/BetShareModal.tsx:135-143` — target:

```tsx
<motion.div
  initial={{ transform: 'scale(0.96) translateY(8px)', opacity: 0 }}
  animate={{ transform: 'scale(1) translateY(0px)', opacity: 1 }}
  exit={{ transform: 'scale(0.96) translateY(8px)', opacity: 0 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  className="relative w-full max-w-md rounded-[22px] overflow-hidden"
  style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}`, boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 24px 60px rgba(0,240,255,0.10)' }}
  onClick={e => e.stopPropagation()}
>
```

`src/components/PriceChartModal.tsx:127-134` — target:

```tsx
<motion.div
  initial={{ transform: 'scale(0.95)', opacity: 0 }}
  animate={{ transform: 'scale(1)', opacity: 1 }}
  exit={{ transform: 'scale(0.95)', opacity: 0 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  className="w-full max-w-2xl rounded-2xl p-6"
  style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}` }}
  onClick={e => e.stopPropagation()}
>
```

## Repo conventions to follow

- `BetShareModal.tsx:139`'s spring config, `{ type: 'spring', stiffness: 320, damping: 28 }`,
  is the exemplar — reuse it verbatim in `PriceChartModal.tsx` rather than
  inventing a second spring config.
- Both files already use Framer Motion's declarative `initial`/`animate`/`exit`
  API — this plan keeps that API, it only changes which *keys* carry the
  transform (a literal `transform` string instead of `scale`/`y`).

## Steps

1. In `src/components/BetShareModal.tsx`, on the panel `motion.div`
   (currently lines 135-143), replace `initial={{ scale: 0.96, opacity: 0, y: 8 }}`
   with `initial={{ transform: 'scale(0.96) translateY(8px)', opacity: 0 }}`,
   replace `animate={{ scale: 1, opacity: 1, y: 0 }}` with
   `animate={{ transform: 'scale(1) translateY(0px)', opacity: 1 }}`, and
   replace `exit={{ scale: 0.96, opacity: 0, y: 8 }}` with
   `exit={{ transform: 'scale(0.96) translateY(8px)', opacity: 0 }}`. Leave
   the `transition` prop on this file unchanged.
2. In `src/components/PriceChartModal.tsx`, on the panel `motion.div`
   (currently lines 127-134), replace `initial={{ scale: 0.95, opacity: 0 }}`
   with `initial={{ transform: 'scale(0.95)', opacity: 0 }}`, replace
   `animate={{ scale: 1, opacity: 1 }}` with
   `animate={{ transform: 'scale(1)', opacity: 1 }}`, replace
   `exit={{ scale: 0.95, opacity: 0 }}` with
   `exit={{ transform: 'scale(0.95)', opacity: 0 }}`, and add
   `transition={{ type: 'spring', stiffness: 320, damping: 28 }}` as a new
   prop immediately after the `exit` line.

## Boundaries

- Do NOT touch the backdrop `motion.div` in either file — that's plan 001.
- Do NOT change the numeric scale values themselves (0.96/0.95 are both
  within the acceptable 0.9–0.97 range per AUDIT.md §3 — do not "fix" what
  isn't broken).
- Do NOT add a `y`/translate to `PriceChartModal.tsx`'s panel — it doesn't
  have one today and this plan is about GPU-safety and transition
  consistency, not adding new motion.
- If either panel `motion.div` no longer matches the excerpts above (drift
  since commit 56fe27b), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors touching these
  two files.
- **Feel check**: open the price chart modal (from a battle card) and the
  share modal (after placing a bet) back to back and confirm:
  - Both panels still scale up from ~96%/95% to 100% with a fade, with no
    visible jump or flash at the start of the animation (a broken transform
    string parse would show as an instant snap instead of a scale).
  - Both panels now settle with the same spring feel — same amount of
    overshoot, same perceived speed.
  - In Chrome DevTools Performance panel, recording the open animation should
    show the transform running on the compositor thread, not causing a
    "Recalculate Style" spike per frame.
- **Done when**: both panels animate via a literal `transform` string and
  share the identical explicit spring `transition` prop.
