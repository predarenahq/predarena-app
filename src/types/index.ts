export type Side = "left" | "draw" | "right";

export type MatchStatus = "upcoming" | "live" | "settled" | "cancelled";

export type MatchCategory = "major" | "altcoin" | "meme";

export type MatchDuration = "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";

export type TokenOption = {
  ticker: string;
  odds: number;
  change: string;
};

export type Match = {
  id: string;
  category: MatchCategory;
  board: "Live" | "Upcoming";
  duration: MatchDuration;
  league: string;
  title: string;
  subtitle: string;
  left: TokenOption;
  draw: {
    odds: number;
    change: string;
  };
  right: TokenOption;
  pool: number;
  entries: number;
  timer: string;
  status: MatchStatus;
  startTime?: string;
  endTime?: string;
  winner?: Side;
};

export type SlipSelection = {
  matchId: string;
  matchTitle: string;
  chosenSide: Side;
  pickLabel: string;
  oddsAtPick: number;
  duration: MatchDuration;
};

export type SlipStatus = "open" | "won" | "lost" | "cancelled";

export type Slip = {
  id: string;
  userId: string;
  selections: SlipSelection[];
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  status: SlipStatus;
  createdAt: string;
};

export type MatchResult = {
  matchId: string;
  leftPerformance: number;
  rightPerformance: number;
  winner: Side;
  settledAt: string;
};