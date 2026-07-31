import { createClient } from "@supabase/supabase-js";
import type {
  BattingAggregate, BowlingAggregate, FieldingAggregate,
  Match, MatchTrendItem, PaginatedMatchResult,
  TeamAggregatesResponse, VenueAggregate
} from "../types";
import { appendMatch, buildPlayers, emptyState, findDuplicateMatch, saveState } from "./storage";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

export async function loadRemoteState() {
  if (!supabase) return { matches: [] as Match[], players: [] as ReturnType<typeof buildPlayers> };
  const { data, error } = await supabase.rpc("load_normalized_matches");
  if (error) throw new Error(`Could not load matches: ${error.message}`);
  const matches = (Array.isArray(data) ? data : []) as Match[];
  const state = matches.length ? { matches, players: buildPlayers(matches) } : { matches: [] as Match[], players: [] as ReturnType<typeof buildPlayers> };
  saveState(state);
  return state;
}

export async function saveRemoteMatch(currentState: { players: any[]; matches: Match[] }, match: Match) {
  if (!supabase) return appendMatch(currentState, match);

  const duplicate = findDuplicateMatch(currentState, match);
  if (duplicate) {
    throw new Error(`This match already exists: ${duplicate.teamA} vs ${duplicate.teamB} on ${duplicate.matchDate ?? "unknown date"}.`);
  }

  const { error } = await supabase.rpc("save_normalized_match", { payload: match });

  if (error) {
    if (error.code === "23505" || error.message?.includes("duplicate")) {
      throw new Error("This match already exists in Supabase.");
    }
    throw new Error(`Could not save match: ${error.message}`);
  }

  const matches = [match, ...currentState.matches];
  const next = { matches, players: buildPlayers(matches) };
  saveState(next);
  return next;
}

// ── New paginated + aggregate RPC functions ──

export async function loadPaginatedMatches(page: number, pageSize: number): Promise<PaginatedMatchResult> {
  if (!supabase) return { total: 0, page: 1, pageSize, matches: [] };
  const { data, error } = await supabase.rpc("get_match_page", { p_page: page, p_page_size: pageSize });
  if (error) throw new Error(`Could not load matches: ${error.message}`);
  return (data ?? { total: 0, page: 1, pageSize, matches: [] }) as PaginatedMatchResult;
}

export async function loadMatchDetail(matchId: string): Promise<Match | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_match_detail", { p_match_id: matchId });
  if (error) throw new Error(`Could not load match: ${error.message}`);
  return (data as Match) ?? null;
}

export async function fetchBattingAggregates(): Promise<BattingAggregate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_batting_aggregates");
  if (error) throw new Error(`Could not load batting stats: ${error.message}`);
  return (Array.isArray(data) ? data : []) as BattingAggregate[];
}

export async function fetchBowlingAggregates(): Promise<BowlingAggregate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_bowling_aggregates");
  if (error) throw new Error(`Could not load bowling stats: ${error.message}`);
  return (Array.isArray(data) ? data : []) as BowlingAggregate[];
}

export async function fetchFieldingAggregates(): Promise<FieldingAggregate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_fielding_aggregates");
  if (error) throw new Error(`Could not load fielding stats: ${error.message}`);
  return (Array.isArray(data) ? data : []) as FieldingAggregate[];
}

export async function fetchTeamAggregates(): Promise<TeamAggregatesResponse> {
  if (!supabase) return { teamStats: [], runRates: [], composition: [], forAgainst: [], matchTrends: [], latestMatch: null };
  const { data, error } = await supabase.rpc("get_team_aggregates");
  if (error) throw new Error(`Could not load team stats: ${error.message}`);
  return (data ?? { teamStats: [], runRates: [], composition: [], forAgainst: [], matchTrends: [], latestMatch: null }) as TeamAggregatesResponse;
}

export async function fetchVenueAggregates(): Promise<VenueAggregate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_venue_aggregates");
  if (error) throw new Error(`Could not load venue stats: ${error.message}`);
  return (Array.isArray(data) ? data : []) as VenueAggregate[];
}
