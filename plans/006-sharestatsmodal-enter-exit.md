# 006 — Give ShareStatsModal an enter/exit animation

- **Status**: DONE
- **Commit**: 4d229ee
- **Severity**: MEDIUM
- **Category**: Missed opportunities (Preventing a jarring change / cohesion)
- **Estimated scope**: 1 file, 1 edit

## Problem

`src/ShareStatsModal.tsx` hard mounts/unmounts with zero transition — no backdrop
fade, no panel scale/fade, nothing. Its two sibling modals in this app,
`src/components/BetShareModal.tsx` and `src/components/PriceChartModal.tsx`,
both already use `AnimatePresence` with a tuned spring for the panel and an
eased fade for the backdrop. This modal being the only one with an instant
pop reads as an oversight, not a deliberate choice.

`src/ShareStatsModal.tsx:59-71` — current:

```tsx
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-[20px] p-6" style={{ background: "var(--panel)" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Share your stats</h3>
          <button onClick={onClose} className="text-sm" style={{ color: "var(--text-soft)" }}>Close</button>
        </div>
```

The exemplar in `src/components/BetShareModal.tsx:124-143` (current, already
in production in this repo):

```tsx
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md rounded-[22px] overflow-hidden"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.lineStrong}`, boxShadow: '0 1px 3px rgba(0,0,0,0.4), var(--shadow-hover)' }}
            onClick={e => e.stopPropagation()}
```

## Target

Wrap `ShareStatsModal`'s return in `AnimatePresence`, keyed on `open`, using
the identical recipe already proven in `BetShareModal.tsx`: backdrop opacity
fade at 200ms with the strong ease-out curve `[0.23, 1, 0.32, 1]`, panel
scale+opacity on a spring (`{ type: 'spring', stiffness: 320, damping: 28 }`),
scale starting at `0.96` (within the app's established `0.9–0.97` entrance
range — never `scale(0)`). `useReducedMotion()` gates the panel's
scale/translate down to opacity-only, exactly as `BetShareModal.tsx` and
`PriceChartModal.tsx` already do — this file has no translate on entry
(no `y` offset), so its reduced-motion branch only needs to drop `scale`,
not `y`.

`src/ShareStatsModal.tsx` — target:

```tsx
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        >
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md rounded-[20px] p-6"
            style={{ background: "var(--panel)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Share your stats</h3>
              <button onClick={onClose} className="text-sm" style={{ color: "var(--text-soft)" }}>Close</button>
            </div>
            {/* ...rest of the modal body, unchanged... */}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
```

The early `if (!open) return null;` guard is removed — `AnimatePresence`
needs the component to keep rendering (returning `null` from inside the
`{open && (...)}` block) so it can play the exit animation instead of
disappearing instantly. The closing `</div></div>` at the end of the
function becomes `</motion.div></motion.div>` followed by
`</AnimatePresence>` and the final `);`.

## Repo conventions to follow

- `src/components/BetShareModal.tsx:2` imports
  `{ motion, AnimatePresence, useReducedMotion } from 'framer-motion'` — add
  the identical import to `src/ShareStatsModal.tsx` (currently only imports
  `React, { useRef, useState, useCallback }` from `"react"` and separate
  imports for `toPng` and `Avatar` — add the framer-motion import as a new
  line, don't merge it into the React import).
- Call `useReducedMotion()` once at the top of the component body, same
  placement pattern as `BetShareModal.tsx:95` (`const reduceMotion = useReducedMotion()`
  placed right after the existing `useState` calls).
- Keep every existing class name, inline style, and prop on the outer two
  `div`s exactly as they are today — only the tag name (`div` → `motion.div`)
  and the new `initial`/`animate`/`exit`/`transition` props change. Do not
  touch `className` or `style` values.

## Steps

1. In `src/ShareStatsModal.tsx`, add `import { motion, AnimatePresence, useReducedMotion } from "framer-motion";`
   as a new import line (after the existing `import Avatar from "./Avatar";`).
2. Inside the component body, immediately after `const [busy, setBusy] = useState(false);`,
   add `const reduceMotion = useReducedMotion();`.
3. Remove the line `if (!open) return null;`.
4. Change `return (` to `return (\n    <AnimatePresence>\n      {open && (`.
5. Change the outer `<div className="fixed inset-0 z-[100] ...">` to a
   `<motion.div>` with the backdrop props shown in Target (`initial`,
   `animate`, `exit`, `transition`), keeping its existing `className`,
   `style`, and `onClick` exactly as they are.
6. Change the inner `<div className="w-full max-w-md rounded-[20px] p-6" ...>`
   to a `<motion.div>` with the panel props shown in Target (`initial`,
   `animate`, `exit`, `transition`), keeping its existing `className`,
   `style`, and `onClick` exactly as they are.
7. Do not touch anything between this inner `motion.div`'s opening tag and
   its closing tag — the header, the card preview, the toggle, the action
   buttons, and the helper text all stay exactly as they are today.
8. At the end of the function, close the two `motion.div`s (matching the two
   opening tags from steps 5-6), then close `{)}`, then `</AnimatePresence>`,
   then the final `);`.

## Boundaries

- Do NOT touch `src/components/BetShareModal.tsx` or
  `src/components/PriceChartModal.tsx` — they are reference only.
- Do NOT change the card-capture logic (`cardRef`, `download`, `toPng` call,
  the fixed `500x297` dimensions, or the scaling wrapper ref callback around
  line 72-84) — none of that is in scope.
- Do NOT change `shareX`, the toggle checkbox, the download/share buttons,
  or any copy/text in the file.
- Do NOT add a `y`/translate offset to the panel — this modal didn't have
  one before and none is being introduced, only `scale` + `opacity`.
- If the current code no longer matches the excerpt in "Problem" (drift
  since commit 4d229ee), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors.
- **Feel check**: open "Share your stats" from the private profile page and
  confirm:
  - The backdrop fades in, the panel scales up from ~96% with a fade, and
    they settle together — no instant pop.
  - Closing (background click or the Close button) reverses smoothly —
    the panel doesn't just vanish.
  - In DevTools, set "Emulate CSS media feature prefers-reduced-motion" to
    `reduce`: confirm the panel now only fades (no scale), while the
    backdrop's opacity fade is unaffected.
  - The stat card itself, the toggle, and the download/share buttons look
    and behave exactly as before — nothing inside the panel changed.
- **Done when**: the modal enters/exits via `AnimatePresence` matching the
  `BetShareModal.tsx` recipe, reduced motion is honored, and no other part
  of the file changed.
