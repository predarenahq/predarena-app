# 001 — Give modal backdrops an explicit ease-out transition

- **Status**: DONE
- **Commit**: 56fe27b
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 2 files, 2 one-line edits

## Problem

Both modal backdrops animate opacity with no `transition` prop at all, so they
silently fall back to Framer Motion's internal default tween instead of the
repo's intended strong easing. This repo has no existing `--ease-*` tokens
anywhere in `src`, so there is nothing today to be inconsistent with, but the
two backdrops should still be pinned to an explicit, intentional curve rather
than an undocumented library default.

`src/components/BetShareModal.tsx:127-134` — current:

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
  onClick={onClose}
>
```

`src/components/PriceChartModal.tsx:119-126` — current:

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
  onClick={onClose}
>
```

## Target

Add an explicit `transition` prop to both backdrops using the strong
ease-out curve from AUDIT.md §2 (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`),
at a duration inside the "Modals, drawers" budget (200–500ms) — use 200ms,
matching the fast end of that range since it's just an opacity fade, not the
panel's own entrance:

```tsx
transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
```

## Repo conventions to follow

- There are no existing `--ease-*` CSS custom properties or JS easing
  constants anywhere in `src` (confirmed via `grep -rn "cubic-bezier\|--ease" src`).
  Do not invent a new shared token file for this — inline the array literal
  `[0.23, 1, 0.32, 1]` directly in the `transition` prop, exactly as shown
  above, in both files. (A shared token is out of scope for this plan — see
  plan 002, which touches the same two components and could introduce one
  if both plans are done together.)
- `BetShareModal.tsx:139` already passes an explicit `transition` prop to its
  panel motion.div — use that as the pattern for "this component authors its
  transitions explicitly," just applied here to the backdrop instead.

## Steps

1. In `src/components/BetShareModal.tsx`, on the backdrop `motion.div`
   (currently lines 127-134), add `transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}`
   as a new prop, placed after `exit={{ opacity: 0 }}` and before `className`.
2. In `src/components/PriceChartModal.tsx`, on the backdrop `motion.div`
   (currently lines 119-126), add the identical `transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}`
   prop in the same position.

## Boundaries

- Do NOT touch the panel `motion.div` in either file (`BetShareModal.tsx:135-143`,
  `PriceChartModal.tsx:127-134`) — that's plan 002.
- Do NOT change the backdrop's `opacity` values, background color, blur, or
  any other prop — timing function and duration only.
- Do NOT add new dependencies or a new tokens file.
- If the backdrop `motion.div` no longer matches the excerpt above (drift
  since commit 56fe27b), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` should report no new errors touching
  these two files.
- **Feel check**: open each modal (share sheet after placing a bet; price
  chart from a battle card) and confirm:
  - The backdrop fade feels crisp and immediate, not sluggish — it should
    visibly finish before or around when the panel settles.
  - In DevTools Animations panel at 10% playback speed, the backdrop opacity
    curve should show a fast start with continued easing toward the end
    (ease-out), not a linear ramp.
- **Done when**: both backdrops have the identical explicit `transition` prop
  and no visual regression in open/close feel.
