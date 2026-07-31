import { createClient } from "@supabase/supabase-js";
import type { Match, TrackerState } from "../types";
import { appendMatch, buildPlayers, emptyState, findDuplicateMatch, saveState } from "./storage";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

export async function loadRemoteState(): Promise<TrackerState> {
  if (!supabase) return emptyState();

  // Try the new normalized RPC first
  try {
    const { data, error } = await supabase.rpc("load_normalized_matches");
    if (!error && Array.isArray(data)) {
      const matches = (data as any[]).filter(Boolean) as Match[];
      const state = matches.length ? { matches, players: buildPlayers(matches) } : emptyState();
      saveState(state);
      return state;
    }
  } catch {
    // RPC not available yet, fall through to legacy path
  }

  // Legacy fallback: load from old matches table (match_data jsonb column)
  const { data, error } = await supabase
    .from("matches")
    .select("match_data")
    .order("match_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load Supabase matches: ${error.message}`);
  const matches = (data ?? []).map((row) => row.match_data as Match).filter(Boolean);
  const state = matches.length ? { matches, players: buildPlayers(matches) } : emptyState();
  saveState(state);
  return state;
}

export async function saveRemoteMatch(currentState: TrackerState, match: Match): Promise<TrackerState> {
  if (!supabase) return appendMatch(currentState, match);

  const duplicate = findDuplicateMatch(currentState, match);
  if (duplicate) {
    throw new Error(`This match already exists: ${duplicate.teamA} vs ${duplicate.teamB} on ${duplicate.matchDate ?? "unknown date"}.`);
  }

  // Try the new normalized RPC first (atomic save into all normalized tables)
  try {
    const { error } = await supabase.rpc("save_normalized_match", { payload: match });
    if (error) {
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        throw new Error("This match already exists in Supabase.");
      }
      // Fall through to legacy path on RPC not found
      if (!error.message?.includes("function") && !error.message?.includes("not found")) {
        throw new Error(`Could not save match to Supabase: ${error.message}`);
      }
    } else {
      // Successfully saved via RPC
      const matches = [match, ...currentState.matches];
      const next = { matches, players: buildPlayers(matches) };
      saveState(next);
      return next;
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("This match already exists")) throw e;
    // RPC not available, fall through to legacy path
  }

  // Legacy fallback: insert into old matches table with match_data jsonb
  const { error } = await supabase.from("matches").insert({
    id: match.id,
    fingerprint: match.fingerprint,
    match_date: match.matchDate || null,
    team_a: match.teamA,
    team_b: match.teamB,
    winner_team: match.winnerTeam || null,
    result_text: match.resultText || null,
    source_pdf_filename: match.sourcePdfFilename || null,
    match_data: match
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("This match already exists in Supabase.");
    }
    throw new Error(`Could not save match to Supabase: ${error.message}`);
  }

  const matches = [match, ...currentState.matches];
  const next = { matches, players: buildPlayers(matches) };
  saveState(next);
  return next;
}
