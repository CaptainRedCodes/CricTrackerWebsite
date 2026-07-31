import type { Innings, Match } from "../types";
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
      bestRuns: Infinity
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
    bestFigures: `${row.bestWickets}/${Number.isFinite(row.bestRuns) ? row.bestRuns : 0}`
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

// Matches can share a date; charts key points by `name`, so duplicate labels
// would collapse onto the same axis position and hide a match. Make each
// label unique by appending a counter to repeats.
function uniqueMatchLabels(matches: Match[]): string[] {
  const seen = new Map<string, number>();
  return matches.map((match, index) => {
    const base = match.matchDate ?? `Match ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

export function matchTrend(matches: Match[]) {
  const chronological = [...matches].reverse();
  const labels = uniqueMatchLabels(chronological);
  return chronological.map((match, index) => {
    const first = match.innings[0];
    const second = match.innings[1];
    return {
      name: labels[index],
      [first.battingTeam]: first.totalRuns,
      [second.battingTeam]: second.totalRuns,
      total: first.totalRuns + second.totalRuns,
      wickets: first.totalWickets + second.totalWickets,
      extras: first.extrasTotal + second.extrasTotal
    };
  });
}

// Per-match run rate (CRR) for each batting team — momentum metric.
export function matchRunRates(matches: Match[]) {
  const chronological = [...matches].reverse();
  const labels = uniqueMatchLabels(chronological);
  return chronological.map((match, index) => {
    const rr = (innings: typeof match.innings[number]) => {
      const balls = oversToBalls(innings.overs);
      return balls ? +((innings.totalRuns * 6) / balls).toFixed(2) : 0;
    };
    const first = match.innings[0];
    const second = match.innings[1];
    return {
      name: labels[index],
      [first.battingTeam]: rr(first),
      [second.battingTeam]: rr(second)
    };
  });
}

// Win rate summary for a single team (for radial gauges / H2H).
export function teamWinRate(matches: Match[], team: string) {
  const teams = teamStats(matches);
  const t = teams.find((x) => x.team === team);
  if (!t) return { team, wins: 0, losses: 0, noResult: 0, total: 0, rate: 0 };
  const noResult = t.matches - t.wins - t.losses;
  const decided = t.wins + t.losses;
  return { team, wins: t.wins, losses: t.losses, noResult, total: t.matches, rate: decided ? t.wins / decided : 0 };
}

// How runs are scored: boundaries (4s), sixes, rotation (everything else).
export function runsComposition(matches: Match[], team?: string) {
  let foursRuns = 0, sixesRuns = 0, rotation = 0;
  for (const row of getAllBatting(matches)) {
    if (team && row.team !== team) continue;
    const b = row.fours * 4 + row.sixes * 6;
    foursRuns += row.fours * 4;
    sixesRuns += row.sixes * 6;
    rotation += Math.max(row.runs - b, 0);
  }
  return [
    { name: "Fours", value: foursRuns, color: "#22c55e" },
    { name: "Sixes", value: sixesRuns, color: "#f97316" },
    { name: "Rotation", value: rotation, color: "#3b82f6" }
  ];
}

// Per-player recent scores in chronological order (for sparklines).
export function playerFormSeries(matches: Match[], playerId: string, limit = 8) {
  const scores: { runs: number; date: string | undefined }[] = [];
  for (const match of [...matches].reverse()) {
    for (const innings of match.innings) {
      const row = innings.batting.find((b) => b.playerId === playerId);
      if (row) scores.push({ runs: row.runs, date: match.matchDate });
    }
  }
  return scores.slice(-limit).map((s) => s.runs);
}

// Bowlers positioned by economy (x) vs wickets (y) — identifies strike vs economical bowlers.
export function bowlerScatter(matches: Match[]) {
  return playerBowlingStats(matches)
    .filter((b) => b.economy !== "-")
    .map((b) => ({
      name: b.name,
      economy: Number(b.economy),
      wickets: b.wickets,
      overs: b.overs,
      dotPct: b.balls ? +((b.dotBalls / b.balls) * 100).toFixed(1) : 0
    }));
}

// Fall-of-wickets progression for an innings (classic cricket "worm").
// X axis is overs so the full innings is projected; the line always ends at the
// final score, even when no (more) wickets fell — otherwise low-wicket innings
// render as an empty chart.
export function inningsWorm(innings: { battingTeam: string; totalRuns: number; totalWickets: number; overs: string; fallOfWickets: Array<{ wicketNumber: number; scoreAtFall: number; batterOut: string; over: string }> }) {
  const points = innings.fallOfWickets.map((f) => ({
    over: Number(f.over),
    overText: f.over,
    wicket: f.wicketNumber,
    score: f.scoreAtFall,
    batter: f.batterOut,
    final: false
  }));
  const last = points[points.length - 1];
  if (!last || last.score !== innings.totalRuns || last.wicket !== innings.totalWickets) {
    points.push({
      over: Number(innings.overs),
      overText: innings.overs,
      wicket: innings.totalWickets,
      score: innings.totalRuns,
      batter: "",
      final: true
    });
  }
  // Prepend the starting point (0/0) so the line starts at the origin.
  return [{ over: 0, overText: "0", wicket: 0, score: 0, batter: "", final: false }, ...points];
}

// Merged innings progression — both teams on one chart for easy comparison.
// Each team's worm points are interspersed; `connectNulls` on the Line
// components keeps each line attached to its own data.
export function matchWorm(innings: Innings[]) {
  const raw: Array<{ over: number; overText: string; team: string; score: number; wicket: number; batter: string; final: boolean }> = [];
  for (const inn of innings) {
    for (const w of inningsWorm(inn)) {
      raw.push({ ...w, team: inn.battingTeam });
    }
  }
  raw.sort((a, b) => a.over - b.over);

  const teams = [...new Set(raw.map((r) => r.team))];
  const data = raw.map((r) => {
    const row: Record<string, any> = { over: r.over, overText: r.overText };
    for (const t of teams) {
      if (r.team === t) {
        row[t] = r.score;
        row[`${t}_wicket`] = r.wicket;
        row[`${t}_batter`] = r.batter;
        row[`${t}_final`] = r.final;
      } else {
        row[t] = null;
      }
    }
    return row;
  });
  return { data, teams };
}

export function boundaryStats(matches: Match[]) {
  return playerBattingStats(matches)
    .map((row) => ({ ...row, boundaries: row.fours + row.sixes, boundaryRuns: row.fours * 4 + row.sixes * 6 }))
    .sort((a, b) => b.boundaries - a.boundaries);
}

// Batters scatter: runs on x, strike rate on y — identifies anchors vs hitters.
export function batterScatter(matches: Match[]) {
  return playerBattingStats(matches)
    .filter((b) => b.strikeRate !== "-" && (b.innings || 0) > 0)
    .map((b) => ({ name: b.name, runs: b.runs, strikeRate: Number(b.strikeRate), innings: b.innings }));
}

// Team total runs scored vs conceded (for vs against).
export function teamForAgainst(matches: Match[]) {
  const map = new Map<string, { team: string; scored: number; conceded: number }>();
  for (const match of matches) {
    for (const inn of match.innings) {
      const bat = map.get(inn.battingTeam) ?? { team: inn.battingTeam, scored: 0, conceded: 0 };
      bat.scored += inn.totalRuns;
      map.set(inn.battingTeam, bat);
      const bowl = map.get(inn.bowlingTeam) ?? { team: inn.bowlingTeam, scored: 0, conceded: 0 };
      bowl.conceded += inn.totalRuns;
      map.set(inn.bowlingTeam, bowl);
    }
  }
  return [...map.values()];
}

// Fielding breakdown per player for stacked bar chart.
export function fieldingBreakdown(matches: Match[], limit = 8) {
  return fieldingStats(matches).slice(0, limit).map((f) => ({
    name: f.name,
    catches: f.catches,
    runOuts: f.runOuts,
    stumpings: f.stumpings
  }));
}

// Ground / stadium performance stats.
export function groundStats(matches: Match[]) {
  const map = new Map<string, {
    ground: string;
    matches: number;
    totalRuns: number;
    totalWickets: number;
    highestScore: number;
    lowestScore: number;
    recentDate: string | undefined;
    topWicketTaker: { name: string; wickets: number };
    wins: Map<string, number>;
  }>();
  for (const match of matches) {
    const g = match.ground ?? "Unknown venue";
    const cur = map.get(g) ?? {
      ground: g, matches: 0, totalRuns: 0, totalWickets: 0,
      highestScore: 0, lowestScore: Infinity, recentDate: undefined,
      topWicketTaker: { name: "", wickets: 0 },
      wins: new Map()
    };
    cur.matches++;
    const [first, second] = match.innings;
    const total = first.totalRuns + second.totalRuns;
    const wkts = first.totalWickets + second.totalWickets;
    cur.totalRuns += total;
    cur.totalWickets += wkts;
    cur.highestScore = Math.max(cur.highestScore, first.totalRuns, second.totalRuns);
    cur.lowestScore = Math.min(cur.lowestScore, first.totalRuns, second.totalRuns);
    cur.recentDate = match.matchDate ?? cur.recentDate;
    // best bowling figure at this ground
    for (const inn of match.innings) {
      for (const b of inn.bowling) {
        if (b.wickets > cur.topWicketTaker.wickets) {
          cur.topWicketTaker = { name: b.playerNameRaw, wickets: b.wickets };
        }
      }
    }
    if (match.winnerTeam) cur.wins.set(match.winnerTeam, (cur.wins.get(match.winnerTeam) ?? 0) + 1);
    map.set(g, cur);
  }
  return [...map.values()].map((s) => {
    const topTeam = [...s.wins.entries()].sort((a, b) => b[1] - a[1]);
    return {
      ground: s.ground,
      matches: s.matches,
      avgRuns: s.matches ? +((s.totalRuns / s.matches)).toFixed(1) : 0,
      highest: s.highestScore,
      lowest: s.lowestScore === Infinity ? 0 : s.lowestScore,
      avgWickets: s.matches ? +((s.totalWickets / s.matches)).toFixed(1) : 0,
      lastMatch: s.recentDate,
      bestBowler: s.topWicketTaker.name || "—",
      bestFigures: s.topWicketTaker.wickets || 0,
      topWinsTeam: topTeam[0]?.[0] ?? "—",
      topWinsCount: topTeam[0]?.[1] ?? 0
    };
  }).sort((a, b) => b.matches - a.matches);
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
