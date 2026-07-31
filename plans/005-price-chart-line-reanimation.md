# 005 — Stop the price chart line replaying its draw-in animation every poll

- **Status**: DONE
- **Commit**: 56fe27b
- **Severity**: MEDIUM
- **Category**: Performance / Purpose & frequency
- **Estimated scope**: 1 file, 1 edit

## Problem

`fetchPriceHistory` runs on mount and then every 30 seconds via
`setInterval` while the modal is open (`src/components/PriceChartModal.tsx:57-63`),
calling `setData(merged)` each time. Neither `<Line>` element sets
`isAnimationActive`, so Recharts uses its default (`true`, ~1500ms), meaning
the line's draw-in animation replays on every 30-second refresh — a near
1.5s morph on data the user is actively reading, recurring indefinitely for
as long as the modal stays open. This is also not a `transform`/`opacity`
animation — Recharts drives it via SVG path/stroke interpolation, which is
off the GPU-safe list in AUDIT.md §5.

`src/components/PriceChartModal.tsx:57-63` — current (context, unchanged by
this plan):

```tsx
useEffect(() => {
  if (!open) return
  fetchPriceHistory()
  const interval = setInterval(fetchPriceHistory, 30000)
  return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, coinA, coinB, startTime])
```

`src/components/PriceChartModal.tsx:200-201` — current:

```tsx
<Line type="monotone" dataKey={coinA} stroke={COLORS.coinA} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
<Line type="monotone" dataKey={coinB} stroke={COLORS.coinB} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
```

## Target

Disable the line-draw animation entirely. The chart already opens inside a
modal that itself animates in (plans 001/002/003) — a further 1.5s draw-in
on top of that, replaying every 30 seconds, doesn't serve legibility of live
data the user is trying to read:

```tsx
<Line type="monotone" dataKey={coinA} stroke={COLORS.coinA} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
<Line type="monotone" dataKey={coinB} stroke={COLORS.coinB} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
```

## Repo conventions to follow

- No other Recharts component in this file sets `isAnimationActive` — this
  is a new, explicit override rather than a change to an existing pattern.
  Set it on both `<Line>` elements identically; do not touch `<XAxis>`,
  `<YAxis>`, `<Tooltip>`, `<ReferenceLine>`, or `<Legend>`, none of which
  animate by default in a way this plan is concerned with.

## Steps

1. In `src/components/PriceChartModal.tsx`, on the first `<Line>` element
   (currently line 200, `dataKey={coinA}`), add `isAnimationActive={false}`
   as a new prop.
2. On the second `<Line>` element (currently line 201, `dataKey={coinB}`),
   add `isAnimationActive={false}` as a new prop.

## Boundaries

- Do NOT change the 30-second poll interval, the data-fetching logic, or any
  other part of `fetchPriceHistory`.
- Do NOT touch any other `<Line>` prop (stroke, strokeWidth, dot, activeDot).
- Do NOT add animation to any other chart element as a substitute — the fix
  here is removal, not a faster/smaller version, per AUDIT.md §1's
  "the strongest fix is often delete the animation."
- If the two `<Line>` elements no longer match the excerpt above (drift
  since commit 56fe27b), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` reports no new errors; `isAnimationActive`
  is a valid documented Recharts `<Line>` prop (no type error expected).
- **Feel check**: open the price chart modal and watch it sit open through
  at least one 30-second poll cycle, confirming:
  - The line still updates with new data points after each poll.
  - The line no longer re-draws/morphs from empty on each refresh — new
    points simply appear in the existing line.
  - The initial chart render (first load after the "Loading price data..."
    state) still shows the line immediately rather than a blank chart that
    never draws.
- **Done when**: both `<Line>` elements have `isAnimationActive={false}` and
  a 30-second poll no longer triggers a visible re-draw of the chart line.
