import React, { createContext, useContext, useState } from "react";

/**
 * Shared bet slip. Holds ONLY the selections array so picks made on the homepage
 * AND the battle detail page land in one slip. Everything else - chain toggle,
 * slip-open state, odds effects, the combo placement path - stays in the
 * homepage component untouched; those read this shared array.
 *
 * The selection shape is kept structural (not importing the homepage's
 * SlipSelection type) to avoid a circular import. It matches SlipSelection field
 * for field - the homepage casts freely.
 */
export type SharedSlipSelection = {
  matchId: string;
  arcBattleId?: number | null;
  matchTitle: string;
  chosenSide: "left" | "draw" | "right";
  pickLabel: string;
  oddsAtPick: number;
  duration: string;
};

type SlipCtx = {
  slipSelections: SharedSlipSelection[];
  setSlipSelections: React.Dispatch<React.SetStateAction<SharedSlipSelection[]>>;
};

const Ctx = createContext<SlipCtx | null>(null);

export function SlipProvider({ children }: { children: React.ReactNode }) {
  const [slipSelections, setSlipSelections] = useState<SharedSlipSelection[]>([]);
  return <Ctx.Provider value={{ slipSelections, setSlipSelections }}>{children}</Ctx.Provider>;
}

export function useSlip() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSlip must be used within SlipProvider");
  return c;
}
