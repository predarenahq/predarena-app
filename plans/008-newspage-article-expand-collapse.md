# 008 — Animate the article expand/collapse in NewsPage

- **Status**: DONE
- **Commit**: 4d229ee
- **Severity**: LOW
- **Category**: Preventing a jarring change
- **Estimated scope**: 1 file, 1 edit

## Problem

Clicking a news headline toggles `expanded` and the summary block
`{expanded === item.id && (<div>...)}` snaps open/closed instantly — a
classic un-animated accordion.

`src/NewsPage.tsx:149-165` — current:

```tsx
              {/* Expanded summary */}
              {expanded === item.id && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.lineStrong }}>
                  <p className="text-sm leading-relaxed line-clamp-6" style={{ color: COLORS.textSoft }}>
                    {item.body?.replace(/<[^>]*>/g, '').substring(0, 400)}...
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                    style={{ color: COLORS.accent }}
                  >
                    Read full article <ExternalLink size={12} />
                  </a>
                </div>
              )}
```

## Target

Wrap the conditional block in `AnimatePresence` and turn the `div` into a
`motion.div` that animates `height` (`0` → `auto`) and `opacity` together,
200ms, the strong ease-out curve `[0.23, 1, 0.32, 1]` already used
throughout this app's modals this session. `overflow: hidden` is required
on the animating element so the content doesn't visibly spill out mid-animation
while `height` is still small.

```tsx
              {/* Expanded summary */}
              <AnimatePresence initial={false}>
                {expanded === item.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.lineStrong }}>
                      <p className="text-sm leading-relaxed line-clamp-6" style={{ color: COLORS.textSoft }}>
                        {item.body?.replace(/<[^>]*>/g, '').substring(0, 400)}...
                      </p>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                        style={{ color: COLORS.accent }}
                      >
                        Read full article <ExternalLink size={12} />
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
```

Note the original `<div className="mt-3 pt-3 border-t" ...>` is kept intact,
one level deeper, inside the new `motion.div` wrapper — its own margin/border
styling stays exactly as it is; the `motion.div` wrapper only carries the
animation props and `overflow: hidden`.

## Repo conventions to follow

- `src/NewsPage.tsx` does not currently import `motion`/`AnimatePresence` —
  add the import; `framer-motion` is already a project dependency.
- Use `duration: 0.2, ease: [0.23, 1, 0.32, 1]` — the same curve used for
  every modal backdrop/accordion fixed elsewhere in this app this session.
  Do not invent a different duration or curve.
- `initial={false}` on the outer `AnimatePresence` — this list item mounts
  already-collapsed, so there is no entrance to animate on first render,
  only the open/close toggle.

## Steps

1. In `src/NewsPage.tsx`, add `import { motion, AnimatePresence } from 'framer-motion'`
   as a new import line (after the existing `import { ChevronLeft, ExternalLink } from 'lucide-react'`
   line).
2. Replace the block starting at `{/* Expanded summary */}` through the
   closing `)}` of the `{expanded === item.id && (...)}` conditional
   (currently lines 149-165) with the Target markup above: wrap it in
   `<AnimatePresence initial={false}>`, change the outermost `div` of the
   conditional into a `motion.div` carrying the `initial`/`animate`/`exit`/
   `transition`/`style={{overflow:'hidden'}}` props, and nest the original
   `<div className="mt-3 pt-3 border-t" ...>` (with its children completely
   unchanged) one level inside it.

## Boundaries

- Do NOT change the `onClick={() => setExpanded(expanded === item.id ? null : item.id)}`
  handler on the `<h3>` headline, or the `expanded`/`setExpanded` state.
- Do NOT change the summary text truncation logic
  (`item.body?.replace(...).substring(0, 400)`), the article link, or any
  other content/copy in this block.
- Do NOT touch the loading skeleton, the category filter, the header, or
  any other part of this file.
- If the block at lines 149-165 no longer matches the excerpt above (drift
  since commit 4d229ee), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors.
- **Feel check**: on the news page, click a headline to expand it and
  confirm:
  - The summary eases open (height + fade) rather than snapping.
  - Clicking the headline again eases it closed the same way.
  - Rapidly toggling multiple articles never leaves a stuck half-open
    summary or a layout jump.
  - The truncated body text and "Read full article" link are unchanged.
- **Done when**: the expand/collapse animates via `AnimatePresence` and
  nothing else in the file changed.
