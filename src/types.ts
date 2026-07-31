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

// ── Server-side aggregate types ──

export interface PaginatedMatchResult {
  total: number;
  page: number;
  pageSize: number;
  matches: Match[];
}

export interface BattingAggregate {
  playerId: string;
  name: string;
  innings: number;
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
  highScore: number;
  notOuts: number;
}

export interface BowlingAggregate {
  playerId: string;
  name: string;
  innings: number;
  balls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  dotBalls: number;
  wides: number;
  noballs: number;
  bestWickets: number;
  bestRuns: number;
}

export interface FieldingAggregate {
  playerId: string;
  name: string;
  catches: number;
  runOuts: number;
  stumpings: number;
  total: number;
}

export interface TeamStat {
  team: string;
  matches: number;
  wins: number;
  losses: number;
  runs: number;
  wicketsLost: number;
  balls: number;
  highest: number;
  lowest: number;
  extras: number;
}

export interface RunRateItem {
  name: string;
  team1: string;
  rr1: number;
  team2: string;
  rr2: number;
}

export interface CompositionItem {
  team: string;
  fours: number;
  sixes: number;
  rotation: number;
}

export interface ForAgainstItem {
  team: string;
  scored: number;
  conceded: number;
}

export interface MatchTrendItem {
  name: string;
  team1: string;
  score1: number;
  wickets1: number;
  team2: string;
  score2: number;
  wickets2: number;
  total: number;
  extras: number;
}

export interface TeamAggregatesResponse {
  teamStats: TeamStat[];
  runRates: RunRateItem[];
  composition: CompositionItem[];
  forAgainst: ForAgainstItem[];
  matchTrends: MatchTrendItem[];
  latestMatch: Match | null;
}

export interface VenueAggregate {
  ground: string;
  matches: number;
  avgRuns: number;
  highest: number;
  lowest: number;
  avgWickets: number;
  lastMatch: string | null;
  bestBowler: string;
  bestFigures: number;
  topWinsTeam: string;
  topWinsCount: number;
}
