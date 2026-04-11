import type { MatchResult, Slip } from "../types/index";

export function settleSlip(
  slip: Slip,
  results: MatchResult[]
): "won" | "lost" | "cancelled" {
  if (!slip.selections.length) return "cancelled";

  for (const selection of slip.selections) {
    const result = results.find((r) => r.matchId === selection.matchId);

    if (!result) {
      return "cancelled";
    }

    if (result.winner !== selection.chosenSide) {
      return "lost";
    }
  }

  return "won";
}