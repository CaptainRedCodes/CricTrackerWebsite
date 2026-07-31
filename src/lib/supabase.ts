import { createClient } from "@supabase/supabase-js";
import type { Match, TrackerState } from "../types";
import { appendMatch, buildPlayers, emptyState, findDuplicateMatch, saveState } from "./storage";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

export async function loadRemoteState(): Promise<TrackerState> {
  if (!supabase) return emptyState();

  const { data, error } = await supabase.rpc("load_normalized_matches");

  if (error) throw new Error(`Could not load matches: ${error.message}`);
  const matches = (Array.isArray(data) ? data : []) as Match[];
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
