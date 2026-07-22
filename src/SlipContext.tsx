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

const STORAGE_KEY = "preda_slip";

export function SlipProvider({ children }: { children: React.ReactNode }) {
  // Persist the slip across refreshes - important now that picks are made across
  // routes (homepage + battle pages) and a refresh shouldn't lose them. Only the
  // picks array is stored; placement still re-validates odds server-side at bet
  // time, so a stale stored pick can't place at a bad price.
  const [slipSelections, setSlipSelections] = useState<SharedSlipSelection[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slipSelections)); } catch {}
  }, [slipSelections]);

  return <Ctx.Provider value={{ slipSelections, setSlipSelections }}>{children}</Ctx.Provider>;
}

export function useSlip() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSlip must be used within SlipProvider");
  return c;
}
