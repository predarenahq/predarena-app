# 003 — Honor prefers-reduced-motion on both modal entrances

- **Status**: DONE
- **Commit**: 56fe27b
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 files, ~4 edits

## Problem

Neither `BetShareModal.tsx` nor `PriceChartModal.tsx` checks
`prefers-reduced-motion` anywhere (confirmed via
`grep -rn "prefers-reduced-motion\|useReducedMotion" src` — zero hits). Both
modal panels animate `scale` + (in `BetShareModal.tsx`) a `translateY`, which
is real movement with no reduced-motion fallback — an explicit escalation
trigger per AUDIT.md §6. Reduced motion means fewer/gentler animations, not
zero: opacity should still fade, movement should collapse to none.

`src/components/BetShareModal.tsx:1` — current imports:

```tsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
```

`src/components/BetShareModal.tsx:135-143` — current (post plan-002, if
applied first; if plan 002 has not been applied yet, use the `scale`/`y`
keys shown in plan 002's "Problem" section instead):

```tsx
<motion.div
  initial={{ transform: 'scale(0.96) translateY(8px)', opacity: 0 }}
  animate={{ transform: 'scale(1) translateY(0px)', opacity: 1 }}
  exit={{ transform: 'scale(0.96) translateY(8px)', opacity: 0 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  ...
>
```

`src/components/PriceChartModal.tsx:1` — current imports:

```tsx
import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
```

`src/components/PriceChartModal.tsx:127-134` — current (post plan-002; if
plan 002 has not been applied yet, use the `scale`-only keys shown in plan
002's "Problem" section instead):

```tsx
<motion.div
  initial={{ transform: 'scale(0.95)', opacity: 0 }}
  animate={{ transform: 'scale(1)', opacity: 1 }}
  exit={{ transform: 'scale(0.95)', opacity: 0 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  ...
>
```

## Target

Import `useReducedMotion` from `framer-motion` in both files, read it once
per component, and branch the transform strings so movement collapses to
`scale(1)`/no translate while opacity fading is preserved:

`src/components/BetShareModal.tsx` — target:

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
// ...inside the component:
const reduceMotion = useReducedMotion()
// ...panel motion.div:
<motion.div
  initial={{ transform: reduceMotion ? 'scale(1)' : 'scale(0.96) translateY(8px)', opacity: 0 }}
  animate={{ transform: 'scale(1) translateY(0px)', opacity: 1 }}
  exit={{ transform: reduceMotion ? 'scale(1)' : 'scale(0.96) translateY(8px)', opacity: 0 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  ...
>
```

`src/components/PriceChartModal.tsx` — target:

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
// ...inside the component:
const reduceMotion = useReducedMotion()
// ...panel motion.div:
<motion.div
  initial={{ transform: reduceMotion ? 'scale(1)' : 'scale(0.95)', opacity: 0 }}
  animate={{ transform: 'scale(1)', opacity: 1 }}
  exit={{ transform: reduceMotion ? 'scale(1)' : 'scale(0.95)', opacity: 0 }}
  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
  ...
>
```

## Repo conventions to follow

- This repo has no existing `useReducedMotion` usage to imitate — this is
  the first. Follow AUDIT.md §6's documented pattern exactly: import the
  hook from `framer-motion` (already a dependency in both files), call it
  once at the top of the component body, and branch only the
  transform/movement values — never branch `opacity`.
- Keep the backdrop's plain opacity fade (plan 001) as-is in both files —
  opacity-only fades need no reduced-motion branch since they carry no
  movement.

## Steps

1. In `src/components/BetShareModal.tsx`, add `useReducedMotion` to the
   `framer-motion` import on line 2, changing
   `import { motion, AnimatePresence } from 'framer-motion'` to
   `import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'`.
2. Inside `export default function BetShareModal({...}) {`, immediately
   after the existing `const [copied, setCopied] = useState<...>(null)` line,
   add `const reduceMotion = useReducedMotion()`.
3. On the panel `motion.div`, change the `initial` and `exit` `transform`
   values to branch on `reduceMotion` as shown in Target above. Leave
   `animate` unchanged (it's always the settled state).
4. In `src/components/PriceChartModal.tsx`, add `useReducedMotion` to the
   `framer-motion` import on line 2, changing
   `import { motion, AnimatePresence } from 'framer-motion'` to
   `import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'`.
5. Inside `export default function PriceChartModal({...}) {`, immediately
   after the existing `const [data, setData] = useState<ChartPoint[]>([])`
   line, add `const reduceMotion = useReducedMotion()`.
6. On the panel `motion.div`, change the `initial` and `exit` `transform`
   values to branch on `reduceMotion` as shown in Target above.

## Boundaries

- Do NOT branch the backdrop's opacity fade — it has no movement and needs
  no reduced-motion handling.
- Do NOT touch any other state/hooks in either component.
- Do NOT add a reduced-motion branch to the spring `transition` itself —
  only the transform values change; the same spring can safely animate a
  no-op (`scale(1)` → `scale(1)`).
- If this plan is executed before plan 002, apply the reduced-motion branch
  to whatever `scale`/`y` keys currently exist (see the "if plan 002 has not
  been applied yet" notes above) rather than blocking on plan 002.
- If the cited hook-call insertion points no longer match (drift since
  commit 56fe27b), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors; `useReducedMotion`
  resolves from the existing `framer-motion` package (no new dependency
  needed — check `package.json` already lists `framer-motion` if unsure).
- **Feel check**: in Chrome DevTools, open the Rendering panel, set
  "Emulate CSS media feature prefers-reduced-motion" to `reduce`, then open
  each modal and confirm:
  - The panel still fades in (opacity 0→1) — it does not pop in instantly.
  - The panel no longer visibly scales or slides — it appears at its final
    size and position immediately.
  - Toggling the emulation back to "No emulation" restores the original
    scale+translate entrance.
- **Done when**: both files import and call `useReducedMotion`, and both
  panels' `initial`/`exit` transforms collapse to `scale(1)` (with translate
  removed where present) when reduced motion is active, while `opacity`
  fading is preserved in both modes.
