# 004 — Crossfade the copy-button icon instead of an instant swap

- **Status**: DONE
- **Commit**: 56fe27b
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, 2 near-identical edits

## Problem

The "Copy code" and "Copy link" buttons each swap their leading icon
(`Copy`/`LinkIcon` → `Check`) the instant `copied` changes, with zero
transition on the icon itself — while the button's own background already
eases via the `transition-colors` Tailwind class on the same click. The two
coordinated properties (background color, icon) fall out of sync: one eases,
one teleports.

`src/components/BetShareModal.tsx:203-210` — current:

```tsx
<button
  onClick={() => doCopy(code, 'code')}
  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors"
  style={{ background: copied === 'code' ? 'var(--accent-soft)' : COLORS.accent, color: copied === 'code' ? COLORS.accent : 'var(--accent-ink)' }}
>
  {copied === 'code' ? <Check size={15} /> : <Copy size={15} />}
  {copied === 'code' ? 'Copied!' : 'Copy code'}
</button>
```

`src/components/BetShareModal.tsx:211-218` — current:

```tsx
<button
  onClick={() => doCopy(shareUrl, 'link')}
  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors"
  style={{ background: 'transparent', color: '#fff', border: `1px solid ${COLORS.line}` }}
>
  {copied === 'link' ? <Check size={15} color={COLORS.accent} /> : <LinkIcon size={15} />}
  {copied === 'link' ? 'Link copied' : 'Copy link'}
</button>
```

## Target

Wrap each icon in `AnimatePresence mode="popLayout"` with a `motion.span`
keyed on which icon is showing, using a small scale+fade at the same ~150ms
window Tailwind's default `transition-colors` duration already uses, so both
properties settle together:

```tsx
<button
  onClick={() => doCopy(code, 'code')}
  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors"
  style={{ background: copied === 'code' ? 'var(--accent-soft)' : COLORS.accent, color: copied === 'code' ? COLORS.accent : 'var(--accent-ink)' }}
>
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
  {copied === 'code' ? 'Copied!' : 'Copy code'}
</button>
```

Apply the identical pattern to the second button, swapping in `LinkIcon` and
`copied === 'link'`, and passing `color={COLORS.accent}` on the `Check` icon
to match its current color prop.

## Repo conventions to follow

- `AnimatePresence`/`motion` are already imported in this file
  (`BetShareModal.tsx:2`) — no new import needed beyond what's already there.
- Use the same `duration: 0.15` + `ease: [0.23, 1, 0.32, 1]` curve as plan
  001/002 use elsewhere in this file, so all of this component's hand-authored
  transitions share one curve.
- `mode="popLayout"` (rather than `"wait"`) keeps the button's width from
  jumping while the two icons briefly overlap, since both icons are the same
  `size={15}` and sit in a fixed-height flex row.

## Steps

1. In `src/components/BetShareModal.tsx`, in the "Copy code" button
   (currently lines 203-210), replace the line
   `{copied === 'code' ? <Check size={15} /> : <Copy size={15} />}` with the
   `AnimatePresence`/`motion.span`-wrapped version shown in Target above,
   keeping the icon-only 15px sizing.
2. In the same file, in the "Copy link" button (currently lines 211-218),
   replace the line
   `{copied === 'link' ? <Check size={15} color={COLORS.accent} /> : <LinkIcon size={15} />}`
   with the equivalent `AnimatePresence`/`motion.span`-wrapped version, using
   key `"check-link"`/`"link"` (must differ from the first button's keys
   since `AnimatePresence` keys only need to be unique within their own
   instance, but keep them descriptive) and preserving
   `color={COLORS.accent}` on the `Check` icon.
3. Leave the label text (`'Copied!'`/`'Copy code'`, `'Link copied'`/`'Copy link'`)
   as plain instant conditional text — this plan only addresses the icon.

## Boundaries

- Do NOT change the button's background/color logic or the
  `transition-colors` class — that part already works correctly.
- Do NOT animate the label text — text crossfades on a two-word label this
  short read as flicker, not polish; only the icon.
- Do NOT change the `doCopy`/`robustCopy` logic, the `setTimeout` reset
  durations, or any other state in this file.
- If the two button blocks no longer match the excerpts above (drift since
  commit 56fe27b), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors.
- **Feel check**: click "Copy code," then click "Copy link," and confirm:
  - The icon visibly crossfades/scales rather than popping instantly.
  - The icon transition and the button's background-color transition finish
    at roughly the same moment — they should read as one coordinated change,
    not two.
  - Clicking rapidly (spam-click) never leaves a stuck half-transitioned
    icon — `AnimatePresence` with `mode="popLayout"` should retarget cleanly.
  - In DevTools Animations panel at 10% playback, the icon's scale+opacity
    and the button's background-color should overlap in time.
- **Done when**: both copy buttons crossfade their icon on state change, and
  neither shows an instant pop.
