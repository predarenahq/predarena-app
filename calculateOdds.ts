import type { SlipSelection } from "../types/index";

export function calculateTotalOdds(selections: SlipSelection[]): number {
  if (!selections.length) return 0;

  return selections.reduce((total, selection) => {
    return total * selection.oddsAtPick;
  }, 1);
}

export function calculatePotentialPayout(
  stake: number,
  totalOdds: number
): number {
  if (!stake || !totalOdds) return 0;
  return stake * totalOdds;
}