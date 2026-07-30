import type { Match } from "../types";
import { ballsToOversText, formatAverage, normalizePlayerName, oversToBalls, playerIdFromName } from "./cricket";

export function getAllBatting(matches: Match[]) {
  return matches.flatMap((match) => match.innings.flatMap((innings) => innings.batting.map((row) => ({ ...row, match }))));
}

export function getAllBowling(matches: Match[]) {
  return matches.flatMap((match) => match.innings.flatMap((innings) => innings.bowling.map((row) => ({ ...row, match }))));
}

export function playerBattingStats(matches: Match[]) {
  const map = new Map<string, any>();
  for (const row of getAllBatting(matches)) {
    const current = map.get(row.playerId) ?? {
      playerId: row.playerId,
      name: row.playerNameRaw,
      innings: 0,
      runs: 0,
      balls: 0,
      dismissals: 0,
      fours: 0,
      sixes: 0,
      highScore: 0,
      notOuts: 0
    };
    current.innings += 1;
    current.runs += row.runs;
    current.balls += row.balls;
    current.fours += row.fours;
    current.sixes += row.sixes;
    current.highScore = Math.max(current.highScore, row.runs);
    if (["not_out", "retired_hurt", "retired_not_out"].includes(row.dismissalType)) current.notOuts += 1;
    else current.dismissals += 1;
    map.set(row.playerId, current);
  }
  return [...map.values()].map((row) => ({
    ...row,
    average: formatAverage(row.runs, row.dismissals),
    strikeRate: row.balls ? ((row.runs * 100) / row.balls).toFixed(2) : "-"
  })).sort((a, b) => b.runs - a.runs);
}

export function playerBowlingStats(matches: Match[]) {
  const map = new Map<string, any>();
  for (const row of getAllBowling(matches)) {
    const current = map.get(row.playerId) ?? {
      playerId: row.playerId,
      name: row.playerNameRaw,
      innings: 0,
      balls: 0,
      runsConceded: 0,
      wickets: 0,
      maidens: 0,
      dotBalls: 0,
      wides: 0,
      noballs: 0,
      bestWickets: 0,
      bestRuns: 999
    };
    current.innings += 1;
    current.balls += oversToBalls(row.overs);
    current.runsConceded += row.runsConceded;
    current.wickets += row.wickets;
    current.maidens += row.maidens;
    current.dotBalls += row.dotBalls;
    current.wides += row.wides;
    current.noballs += row.noballs;
    if (row.wickets > current.bestWickets || (row.wickets === current.bestWickets && row.runsConceded < current.bestRuns)) {
      current.bestWickets = row.wickets;
      current.bestRuns = row.runsConceded;
    }
    map.set(row.playerId, current);
  }
  return [...map.values()].map((row) => ({
    ...row,
    overs: ballsToOversText(row.balls),
    economy: row.balls ? ((row.runsConceded * 6) / row.balls).toFixed(2) : "-",
    average: row.wickets ? (row.runsConceded / row.wickets).toFixed(2) : "-",
    strikeRate: row.wickets ? (row.balls / row.wickets).toFixed(2) : "-",
    bestFigures: `${row.bestWickets}/${row.bestRuns === 999 ? 0 : row.bestRuns}`
  })).sort((a, b) => b.wickets - a.wickets || Number(a.economy) - Number(b.economy));
}

export function teamStats(matches: Match[]) {
  const map = new Map<string, any>();
  for (const match of matches) {
    for (const innings of match.innings) {
      const current = map.get(innings.battingTeam) ?? {
        team: innings.battingTeam,
        matches: 0,
        wins: 0,
        runs: 0,
        wicketsLost: 0,
        balls: 0,
        highest: 0,
        lowest: Infinity,
        extras: 0
      };
      current.matches += 1;
      current.wins += match.winnerTeam === innings.battingTeam ? 1 : 0;
      current.runs += innings.totalRuns;
      current.wicketsLost += innings.totalWickets;
      current.balls += oversToBalls(innings.overs);
      current.highest = Math.max(current.highest, innings.totalRuns);
      current.lowest = Math.min(current.lowest, innings.totalRuns);
      current.extras += innings.extrasTotal;
      map.set(innings.battingTeam, current);
    }
  }
  return [...map.values()].map((row) => ({
    ...row,
    losses: row.matches - row.wins,
    averageScore: row.matches ? (row.runs / row.matches).toFixed(1) : "-",
    runRate: row.balls ? ((row.runs * 6) / row.balls).toFixed(2) : "-",
    lowest: row.lowest === Infinity ? 0 : row.lowest
  }));
}

export function fieldingStats(matches: Match[]) {
  const map = new Map<string, any>();
  const ensure = (name: string) => {
    const cleanName = normalizePlayerName(name);
    const id = playerIdFromName(cleanName);
    const current = map.get(id) ?? {
      playerId: id,
      name: cleanName,
      catches: 0,
      runOuts: 0,
      stumpings: 0,
      total: 0
    };
    map.set(id, current);
    return current;
  };

  for (const row of getAllBatting(matches)) {
    const raw = row.dismissalRaw.trim();
    const caught = raw.match(/^c\s+(.+?)\s+b\s+/i);
    const runOut = raw.match(/^run out\s+(.+)$/i);
    const stumped = raw.match(/^st\s+(.+?)\s+b\s+/i);
    if (caught) ensure(caught[1]).catches += 1;
    if (runOut) ensure(runOut[1]).runOuts += 1;
    if (stumped) ensure(stumped[1]).stumpings += 1;
  }

  return [...map.values()].map((row) => ({
    ...row,
    total: row.catches + row.runOuts + row.stumpings
  })).sort((a, b) => b.total - a.total || b.catches - a.catches);
}

export function mvpStats(matches: Match[]) {
  const batting = playerBattingStats(matches);
  const bowling = playerBowlingStats(matches);
  const fielding = fieldingStats(matches);
  const map = new Map<string, any>();
  const ensure = (playerId: string, name: string) => {
    const current = map.get(playerId) ?? {
      playerId,
      name,
      points: 0,
      runs: 0,
      wickets: 0,
      fielding: 0,
      sixes: 0,
      dots: 0
    };
    map.set(playerId, current);
    return current;
  };

  for (const row of batting) {
    const current = ensure(row.playerId, row.name);
    current.runs = row.runs;
    current.sixes = row.sixes;
    current.points += row.runs + row.fours * 2 + row.sixes * 4 + row.notOuts * 5;
  }
  for (const row of bowling) {
    const current = ensure(row.playerId, row.name);
    current.wickets = row.wickets;
    current.dots = row.dotBalls;
    current.points += row.wickets * 25 + row.dotBalls * 2 + row.maidens * 10;
  }
  for (const row of fielding) {
    const current = ensure(row.playerId, row.name);
    current.fielding = row.total;
    current.points += row.catches * 10 + row.runOuts * 12 + row.stumpings * 12;
  }

  return [...map.values()].sort((a, b) => b.points - a.points);
}

export function matchTrend(matches: Match[]) {
  return [...matches].reverse().map((match, index) => {
    const first = match.innings[0];
    const second = match.innings[1];
    return {
      name: match.matchDate ?? `Match ${index + 1}`,
      [first.battingTeam]: first.totalRuns,
      [second.battingTeam]: second.totalRuns,
      total: first.totalRuns + second.totalRuns,
      wickets: first.totalWickets + second.totalWickets,
      extras: first.extrasTotal + second.extrasTotal
    };
  });
}

export function boundaryStats(matches: Match[]) {
  return playerBattingStats(matches)
    .map((row) => ({ ...row, boundaries: row.fours + row.sixes, boundaryRuns: row.fours * 4 + row.sixes * 6 }))
    .sort((a, b) => b.boundaries - a.boundaries);
}

export function dashboardStats(matches: Match[]) {
  const batting = playerBattingStats(matches);
  const bowling = playerBowlingStats(matches);
  const teams = teamStats(matches);
  const mvp = mvpStats(matches);
  const fielding = fieldingStats(matches);
  return {
    latestMatch: matches[0],
    matchesPlayed: matches.length,
    topBatter: batting[0],
    topBowler: bowling[0],
    topMvp: mvp[0],
    topFielder: fielding[0],
    teams
  };
}
