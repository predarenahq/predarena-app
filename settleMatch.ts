import type { Side } from "../types/index";

export function settleMatch(
  startLeft: number,
  endLeft: number,
  startRight: number,
  endRight: number
): {
  leftPerformance: number;
  rightPerformance: number;
  winner: Side;
} {
  const leftPerformance = ((endLeft - startLeft) / startLeft) * 100;
  const rightPerformance = ((endRight - startRight) / startRight) * 100;

  let winner: Side = "draw";

  if (leftPerformance > rightPerformance) {
    winner = "left";
  } else if (rightPerformance > leftPerformance) {
    winner = "right";
  }

  return {
    leftPerformance,
    rightPerformance,
    winner,
  };
}