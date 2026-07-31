import type { Match, TrackerState } from "../types";
import { parseMatchFromPages } from "./parser";
import { playerIdFromName } from "./cricket";
import { samplePages } from "../data/sampleText";

const STORAGE_KEY = "sl-tourney-tracker-state";

export function buildPlayers(matches: Match[]) {
  const map = new Map<string, { id: string; canonicalName: string; aliases: string[] }>();
  for (const match of matches) {
    const names = [
      ...match.squads.map((squad) => squad.playerNameRaw),
      ...match.innings.flatMap((innings) => innings.batting.map((row) => row.playerNameRaw)),
      ...match.innings.flatMap((innings) => innings.bowling.map((row) => row.playerNameRaw)),
      ...match.innings.flatMap((innings) => innings.didNotBat)
    ];
    for (const name of names) {
      const id = playerIdFromName(name);
      if (!map.has(id)) map.set(id, { id, canonicalName: name, aliases: [name] });
    }
  }
  return [...map.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

export function defaultState(): TrackerState {
  const sampleMatch = parseMatchFromPages(samplePages, "Summary Scorecard 26291013.pdf");
  const matches = [sampleMatch];
  return { matches, players: buildPlayers(matches) };
}

export function emptyState(): TrackerState {
  return { matches: [], players: [] };
}

export function loadState(): TrackerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as TrackerState;
    if (!Array.isArray(parsed.matches)) return emptyState();
    return { matches: parsed.matches, players: buildPlayers(parsed.matches) };
  } catch {
    return emptyState();
  }
}

export function saveState(state: TrackerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, players: buildPlayers(state.matches) }));
  } catch {
    throw new Error("Could not save this match in your browser storage. Please export or remove older data before importing more matches.");
  }
}

export function findDuplicateMatch(state: TrackerState, match: Match): Match | undefined {
  return state.matches.find((item) => {
    const sameFingerprint = item.fingerprint && item.fingerprint === match.fingerprint;
    const sameDate = item.matchDate === match.matchDate;
    const existingTeams = [item.teamA, item.teamB].map(String).sort().join("|");
    const incomingTeams = [match.teamA, match.teamB].map(String).sort().join("|");
    const existingScores = item.innings.map((innings) => `${innings.battingTeam}:${innings.totalRuns}/${innings.totalWickets}/${innings.overs}`).sort().join("|");
    const incomingScores = match.innings.map((innings) => `${innings.battingTeam}:${innings.totalRuns}/${innings.totalWickets}/${innings.overs}`).sort().join("|");
    return sameFingerprint || (sameDate && existingTeams === incomingTeams && existingScores === incomingScores);
  });
}

export function appendMatch(state: TrackerState, match: Match): TrackerState {
  const duplicate = findDuplicateMatch(state, match);
  if (duplicate) throw new Error(`This match already exists: ${duplicate.teamA} vs ${duplicate.teamB} on ${duplicate.matchDate ?? "unknown date"}.`);
  const matches = [match, ...state.matches];
  return { matches, players: buildPlayers(matches) };
}
