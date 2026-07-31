# Animation plans

Generated from a `review-animations`-style audit of the two modal components
in `src/components/` (`BetShareModal.tsx`, `PriceChartModal.tsx`), stamped at
commit `56fe27b`.

| # | Title | Severity | Files | Status |
| --- | --- | --- | --- | --- |
| 001 | Modal backdrop easing | LOW | BetShareModal.tsx, PriceChartModal.tsx | DONE |
| 002 | Modal panel GPU-safe transform + consistent spring | HIGH | BetShareModal.tsx, PriceChartModal.tsx | DONE |
| 003 | Reduced-motion for modal entrances | MEDIUM | BetShareModal.tsx, PriceChartModal.tsx | DONE |
| 004 | Copy-button icon crossfade | LOW | BetShareModal.tsx | DONE |
| 005 | Stop chart line re-animating on every poll | MEDIUM | PriceChartModal.tsx | DONE |

## Recommended execution order

1. **002** first — it changes the panel's `initial`/`animate`/`exit` keys
   from `scale`/`y` to a `transform` string, and plan 003 is written against
   that post-002 shape (it also documents the pre-002 fallback, so order
   isn't strictly load-bearing, just cleanest this way).
2. **001** — independent of 002/003, touches only the backdrop.
3. **003** — depends on 002 for which exact keys it's branching (see note
   above); do this after 002.
4. **004** — independent, single file, only touches the copy buttons.
5. **005** — independent, single file, only touches the `<Line>` props.

004 and 005 have no dependency on anything else and can run in any order or
in parallel with 001-003.
