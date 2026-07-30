export type DismissalType =
  | "not_out"
  | "bowled"
  | "caught"
  | "lbw"
  | "run_out"
  | "stumped"
  | "retired_hurt"
  | "retired_not_out"
  | "hit_wicket"
  | "other";

export type TeamName = "HURRICANES" | "DOMINATORS" | string;

export interface Player {
  id: string;
  canonicalName: string;
  aliases: string[];
}

export interface SquadPlayer {
  team: TeamName;
  playerNameRaw: string;
  playerId: string;
  isCaptain: boolean;
}

export interface BattingPerformance {
  id: string;
  inningsId: string;
  orderNo: number;
  playerNameRaw: string;
  playerId: string;
  team: TeamName;
  isCaptain: boolean;
  battingStyle?: string;
  dismissalRaw: string;
  dismissalType: DismissalType;
  runs: number;
  balls: number;
  minutes: number;
  fours: number;
  sixes: number;
  strikeRate: number;
}

export interface BowlingPerformance {
  id: string;
  inningsId: string;
  orderNo: number;
  playerNameRaw: string;
  playerId: string;
  team: TeamName;
  isCaptain: boolean;
  overs: string;
  maidens: number;
  runsConceded: number;
  wickets: number;
  dotBalls: number;
  foursConceded: number;
  sixesConceded: number;
  wides: number;
  noballs: number;
  economy: number;
}

export interface FallOfWicket {
  wicketNumber: number;
  scoreAtFall: number;
  batterOut: string;
  over: string;
}

export interface Innings {
  id: string;
  inningsNumber: number;
  battingTeam: TeamName;
  bowlingTeam: TeamName;
  totalRuns: number;
  totalWickets: number;
  overs: string;
  crr: number;
  extrasTotal: number;
  extrasWide: number;
  extrasNoball: number;
  extrasBye: number;
  extrasLegbye: number;
  batting: BattingPerformance[];
  bowling: BowlingPerformance[];
  didNotBat: string[];
  fallOfWickets: FallOfWicket[];
}

export interface Match {
  id: string;
  fingerprint: string;
  leagueName: string;
  matchDate?: string;
  matchTime?: string;
  ground?: string;
  teamA: TeamName;
  teamB: TeamName;
  tossWinner?: TeamName;
  tossDecision?: string;
  resultText: string;
  winnerTeam?: TeamName;
  winMarginText?: string;
  sourcePdfFilename?: string;
  squads: SquadPlayer[];
  innings: Innings[];
  createdAt: string;
}

export interface TrackerState {
  players: Player[];
  matches: Match[];
}
