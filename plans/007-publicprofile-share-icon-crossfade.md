# 007 — Crossfade the Share button icon in PublicProfilePage

- **Status**: DONE
- **Commit**: 4d229ee
- **Severity**: LOW
- **Category**: Feedback
- **Estimated scope**: 1 file, 1 edit

## Problem

The Share button's icon (`Share2` → `Check`) swaps instantly the moment
`copied` flips to `true`, with zero transition. This is the same gap already
fixed for the "Copy code"/"Copy link" buttons in
`src/components/BetShareModal.tsx` earlier this session — same pattern,
same fix.

`src/PublicProfilePage.tsx:63-72` — current:

```tsx
          {state === "ok" && (
            <button
              onClick={shareProfile}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold transition-all active:scale-[0.97]"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: copied ? "var(--accent)" : "var(--text)" }}
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? "Copied" : "Share"}
            </button>
          )}
```

The exemplar already in production, `src/components/BetShareModal.tsx:209-219`:

```tsx
                      <AnimatePresence mode="popLayout" initial={false}>
                        {copied === 'code' ? (
                          <motion.span key="check" initial={{ opacity: 0, transform: 'scale(0.7)' }} animate={{ opacity: 1, transform: 'scale(1)' }} exit={{ opacity: 0, transform: 'scale(0.7)' }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }} className="flex">
                            <Check size={15} />
                          </motion.span>
                        ) : (
                          <motion.span key="copy" initial={{ opacity: 0, transform: 'scale(0.7)' }} animate={{ opacity: 1, transform: 'scale(1)' }} exit={{ opacity: 0, transform: 'scale(0.7)' }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }} className="flex">
                            <Copy size={15} />
                          </motion.span>
                        )}
                      </AnimatePresence>
```

## Target

`src/PublicProfilePage.tsx:63-72` — target:

```tsx
          {state === "ok" && (
            <button
              onClick={shareProfile}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold transition-all active:scale-[0.97]"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: copied ? "var(--accent)" : "var(--text)" }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {copied ? (
                  <motion.span key="check" initial={{ opacity: 0, transform: 'scale(0.7)' }} animate={{ opacity: 1, transform: 'scale(1)' }} exit={{ opacity: 0, transform: 'scale(0.7)' }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }} className="flex">
                    <Check size={14} />
                  </motion.span>
                ) : (
                  <motion.span key="share" initial={{ opacity: 0, transform: 'scale(0.7)' }} animate={{ opacity: 1, transform: 'scale(1)' }} exit={{ opacity: 0, transform: 'scale(0.7)' }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }} className="flex">
                    <Share2 size={14} />
                  </motion.span>
                )}
              </AnimatePresence>
              {copied ? "Copied" : "Share"}
            </button>
          )}
```

Note the icon size stays `14` (this file's existing size), not `15` like the
`BetShareModal.tsx` exemplar — only the crossfade mechanics are copied, not
the unrelated size value.

## Repo conventions to follow

- `src/PublicProfilePage.tsx` does not currently import `motion`/`AnimatePresence`
  from `framer-motion` at all — add the import. `framer-motion` is already a
  project dependency (used throughout `BetShareModal.tsx`, `PriceChartModal.tsx`,
  `BattleDetailPage.tsx`).
- Use the identical `duration: 0.15, ease: [0.23, 1, 0.32, 1]` and `scale(0.7)`
  values from the `BetShareModal.tsx` exemplar — don't approximate or invent
  a different curve/duration for this button.
- `mode="popLayout"` + `initial={false}` on the `AnimatePresence`, exactly as
  the exemplar — `popLayout` keeps the button from jumping width as the two
  icons briefly overlap; `initial={false}` prevents the icon from playing an
  entrance animation on first mount.

## Steps

1. In `src/PublicProfilePage.tsx`, add `import { motion, AnimatePresence } from "framer-motion";`
   as a new import line (after the existing `import Avatar from "./Avatar";`).
2. Replace the line `{copied ? <Check size={14} /> : <Share2 size={14} />}`
   (currently line 69) with the `AnimatePresence`/`motion.span`-wrapped version
   shown in Target above, keeping the icon size at `14`.
3. Leave the label text (`{copied ? "Copied" : "Share"}`) as a plain instant
   conditional — this plan only addresses the icon, matching how the
   `BetShareModal.tsx` exemplar also leaves its label text un-animated.

## Boundaries

- Do NOT change the button's background/color logic, the `transition-all`
  class, or the `active:scale-[0.97]` press feedback — those already work.
- Do NOT change `shareProfile()`, the `navigator.share`/clipboard logic, the
  `setTimeout` reset duration, or any other state in this file.
- Do NOT touch anything outside this one button.
- Do NOT touch `src/components/BetShareModal.tsx` — it is reference only.
- If the button's current code no longer matches the excerpt above (drift
  since commit 4d229ee), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors.
- **Feel check**: on a public profile page, click "Share" (or trigger the
  clipboard-copy fallback path) and confirm:
  - The icon crossfades/scales rather than popping instantly.
  - The button doesn't jump in width while the two icons briefly overlap.
  - Clicking rapidly never leaves a stuck half-transitioned icon.
- **Done when**: the Share button's icon crossfades on state change and
  nothing else in the file changed.
