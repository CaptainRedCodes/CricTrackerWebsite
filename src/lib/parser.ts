import type { BattingPerformance, BowlingPerformance, FallOfWicket, Innings, Match, SquadPlayer, TeamName } from "../types";
import { classifyDismissal, normalizePlayerName, playerIdFromName } from "./cricket";

const FOOTER_RE = /\d+\/\d+\/\d+,\s+\d+:\d+\s+[AP]M\s+cricheroes\.com/i;

function cleanLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function id(prefix: string, ...parts: Array<string | number>): string {
  return [prefix, ...parts].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parserError(message: string): Error {
  return new Error(`Could not import scorecard: ${message}`);
}

function assertAnchor(index: number, label: string): number {
  if (index < 0) throw parserError(`missing "${label}" section. Please check this is a CricHeroes Summary Scorecard PDF.`);
  return index;
}

function assertNumericTail(tokens: string[], count: number, rowLabel: string, line: string): string[] {
  if (tokens.length <= count) throw parserError(`${rowLabel} row is too short: "${line}"`);
  const tail = tokens.slice(-count);
  if (tail.some((token) => Number.isNaN(Number(token)))) {
    throw parserError(`${rowLabel} row has unexpected numbers: "${line}"`);
  }
  return tail;
}

export function parseBattingRow(line: string, inningsId = "innings", team: TeamName = ""): BattingPerformance {
  const tokens = line.trim().split(/\s+/);
  const orderNo = Number(tokens[0]);
  if (!Number.isInteger(orderNo)) throw parserError(`batting row has invalid order number: "${line}"`);
  const numericTail = assertNumericTail(tokens, 6, "batting", line);
  const [runs, balls, minutes, fours, sixes] = numericTail.slice(0, 5).map(Number);
  const strikeRate = Number(numericTail[5]);
  const middle = tokens.slice(1, -6);
  const styleIndex = middle.findIndex((token) => /^\((RHB|LHB)\)$/i.test(token));
  const splitIndex = styleIndex === -1 ? Math.max(1, middle.findIndex((token) => /^(not|run|retired|b|c|lbw|st|hit)$/i.test(token))) : styleIndex;
  if (splitIndex < 1) throw parserError(`could not find batter name/status boundary in row: "${line}"`);

  const nameTokens = middle.slice(0, styleIndex);
  const rawNameTokens = styleIndex === -1 ? middle.slice(0, splitIndex) : nameTokens;
  const battingStyle = styleIndex === -1 ? undefined : middle[styleIndex].replace(/[()]/g, "").toUpperCase();
  const isCaptain = rawNameTokens.some((token) => /^\([cC]\)$/.test(token));
  const playerNameRaw = normalizePlayerName(rawNameTokens.join(" "));
  const dismissalRaw = middle.slice(styleIndex === -1 ? splitIndex : styleIndex + 1).join(" ");
  const playerId = playerIdFromName(playerNameRaw);

  return {
    id: id("bat", inningsId, orderNo, playerId),
    inningsId,
    orderNo,
    playerNameRaw,
    playerId,
    team,
    isCaptain,
    battingStyle,
    dismissalRaw,
    dismissalType: classifyDismissal(dismissalRaw),
    runs,
    balls,
    minutes,
    fours,
    sixes,
    strikeRate
  };
}

export function parseBowlingRow(line: string, inningsId = "innings", team: TeamName = ""): BowlingPerformance {
  const tokens = line.trim().split(/\s+/);
  const orderNo = Number(tokens[0]);
  if (!Number.isInteger(orderNo)) throw parserError(`bowling row has invalid order number: "${line}"`);
  const numericTail = assertNumericTail(tokens, 10, "bowling", line);
  const nameTokens = tokens.slice(1, -10);
  const isCaptain = nameTokens.some((token) => /^\([cC]\)$/.test(token));
  const playerNameRaw = normalizePlayerName(nameTokens.join(" "));
  const playerId = playerIdFromName(playerNameRaw);

  return {
    id: id("bowl", inningsId, orderNo, playerId),
    inningsId,
    orderNo,
    playerNameRaw,
    playerId,
    team,
    isCaptain,
    overs: numericTail[0],
    maidens: Number(numericTail[1]),
    runsConceded: Number(numericTail[2]),
    wickets: Number(numericTail[3]),
    dotBalls: Number(numericTail[4]),
    foursConceded: Number(numericTail[5]),
    sixesConceded: Number(numericTail[6]),
    wides: Number(numericTail[7]),
    noballs: Number(numericTail[8]),
    economy: Number(numericTail[9])
  };
}

export function parseExtras(line: string) {
  if (!line?.startsWith("Extras:")) throw parserError("missing extras row.");
  const total = Number(line.match(/(\d+)\s*$/)?.[1] ?? 0);
  const values = { total, wide: 0, noball: 0, bye: 0, legbye: 0 };
  const breakdown = line.match(/\((.*?)\)/)?.[1];
  if (!breakdown) return values;
  for (const part of breakdown.split(",")) {
    const [, code, count] = part.trim().match(/^([a-z]+)\s+(\d+)$/i) ?? [];
    if (code === "wd") values.wide = Number(count);
    if (code === "nb") values.noball = Number(count);
    if (code === "b") values.bye = Number(count);
    if (code === "lb") values.legbye = Number(count);
  }
  return values;
}

export function parseTotal(line: string) {
  const match = line.match(/^Total:\s+Overs\s+([\d.]+),\s+Wickets\s+(\d+)\s+(\d+)\s+\(CRR:\s+([\d.]+)\)/i);
  if (!match) throw parserError(`could not parse total row: "${line}"`);
  return {
    overs: match[1],
    wickets: Number(match[2]),
    runs: Number(match[3]),
    crr: Number(match[4])
  };
}

export function parseFallOfWickets(lines: string[]): FallOfWicket[] {
  const text = lines.join(" ").replace(FOOTER_RE, "").trim();
  if (!text || text === "-" || /^-+$/.test(text)) return [];
  return text.split(/\),\s*/).map((chunk) => {
    const normalized = chunk.endsWith(")") ? chunk : `${chunk})`;
    const match = normalized.match(/^(\d+)-(\d+)\s+\((.*),\s+([\d.]+)\s+ov\)$/i);
    if (!match) throw parserError(`could not parse fall of wicket: "${chunk}"`);
    return {
      scoreAtFall: Number(match[1]),
      wicketNumber: Number(match[2]),
      batterOut: normalizePlayerName(match[3]),
      over: match[4]
    };
  });
}

export function parseSquads(pageText: string, teamOne?: string, teamTwo?: string): SquadPlayer[] {
  const lines = cleanLines(pageText);
  const headerIndex = lines.findIndex((line) => line === "Playing Squad");
  if (headerIndex === -1) {
    console.warn("Squad page missing, skipping squad parsing.");
    return [];
  }

  const detected = detectSquadTeams(lines, headerIndex, teamOne, teamTwo);
  if (!detected.teamOne || !detected.teamTwo) {
    console.warn("Could not detect both teams on the squad page. Squads will be empty. Team names from innings:",
      teamOne, teamTwo);
    return [];
  }

  const t1 = detected.teamOne;
  const t2 = detected.teamTwo;
  const squads: SquadPlayer[] = [];

  for (const line of lines.slice(detected.rowsStart)) {
    if (FOOTER_RE.test(line)) break;
    const row = line.match(/^\d+\s+(.+)$/)?.[1];
    if (!row) continue;

    const parts = row.split(/\s{2,}/);
    if (parts.length >= 2) {
      squads.push(makeSquad(t1, parts[0]));
      squads.push(makeSquad(t2, parts[1]));
      continue;
    }

    const names = splitTwoSquadNames(row, t1, t2);
    if (names[0]) squads.push(makeSquad(t1, names[0]));
    if (names[1]) squads.push(makeSquad(t2, names[1]));
  }

  return squads;
}

function detectSquadTeams(
  lines: string[],
  headerIndex: number,
  knownTeamOne?: string,
  knownTeamTwo?: string
): { teamOne: string; teamTwo: string; rowsStart: number } {
  const candidates = lines.slice(headerIndex + 1, headerIndex + 6);

  const teamPatterns = knownTeamOne && knownTeamTwo
    ? [knownTeamOne, knownTeamTwo]
    : ["DOMINATORS", "HURRICANES"];

  const buildRegex = (teams: string[]) =>
    new RegExp(`\\b(${teams.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const line = candidates[offset];
    const teams = line.match(buildRegex(teamPatterns));
    if (teams && teams.length >= 2) {
      return {
        teamOne: teams[0].toUpperCase(),
        teamTwo: teams[1].toUpperCase(),
        rowsStart: headerIndex + 1 + offset + 1
      };
    }
    if (teams && teams.length === 1) {
      const nextTeams = (candidates[offset + 1] ?? "").match(buildRegex(teamPatterns));
      if (nextTeams?.length) {
        return {
          teamOne: teams[0].toUpperCase(),
          teamTwo: nextTeams[0].toUpperCase(),
          rowsStart: headerIndex + 1 + offset + 2
        };
      }
    }
  }

  if (knownTeamOne && knownTeamTwo) {
    const rowsStart = findFirstNumberedLine(lines, headerIndex + 1);
    return { teamOne: knownTeamOne, teamTwo: knownTeamTwo, rowsStart };
  }

  const fallback = (lines[headerIndex + 1] ?? "").split(/\s+/);
  return { teamOne: fallback[0] ?? "", teamTwo: fallback[1] ?? "", rowsStart: headerIndex + 2 };
}

function findFirstNumberedLine(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (/^\d+\s+/.test(lines[index])) return index;
  }
  return startIndex + 2;
}

function splitTwoSquadNames(row: string, teamOne: TeamName, teamTwo: TeamName): [string, string] {
  const knownTeamTwoNames = ["Eqbal", "Aditya", "Manu Madhavan", "Shreyas S", "Niraj Subedi", "Yogi", String(teamTwo)];
  const secondStart = knownTeamTwoNames
    .filter((name) => name && name !== String(teamTwo))
    .map((name) => row.indexOf(name))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];
  if (secondStart) return [row.slice(0, secondStart).trim(), row.slice(secondStart).trim()];
  const knownTeamOneNames = ["Ramit Raj", "Bhaskar Bose", "Sughosh Rao", "Gaurav", "Munit Jindal", "Mohit Momaya", String(teamOne)];
  const first = knownTeamOneNames.find((name) => name && name !== String(teamOne) && row.startsWith(name));
  if (first) return [first, row.slice(first.length).trim()];
  const tokens = row.split(/\s+/);
  const midpoint = Math.ceil(tokens.length / 2);
  return [tokens.slice(0, midpoint).join(" "), tokens.slice(midpoint).join(" ")];
}

function makeSquad(team: TeamName, raw: string): SquadPlayer {
  const isCaptain = /\(\s*[cC]\s*\)/.test(raw);
  const playerNameRaw = normalizePlayerName(raw);
  return { team, playerNameRaw, playerId: playerIdFromName(playerNameRaw), isCaptain };
}

export function parseInnings(pageText: string, inningsNumber: number, bowlingTeam?: TeamName): Innings {
  const lines = cleanLines(pageText);
  const header = lines.find((line) => /\d+\/\d+\s+\([\d.]+\s+Ov\).*Innings/i.test(line));
  if (!header) throw parserError(`missing innings ${inningsNumber} header.`);
  const headerMatch = header.match(/^(.+?)\s+(\d+)\/(\d+)\s+\(([\d.]+)\s+Ov\)/i);
  if (!headerMatch) throw parserError(`could not parse innings ${inningsNumber} header: "${header}"`);
  const battingTeam = headerMatch[1].trim();
  const inningsId = id("inn", inningsNumber, battingTeam);

  const battingHeader = lines.indexOf("No Batsman Status R B M 4s 6s SR");
  const extrasIndex = lines.findIndex((line) => line.startsWith("Extras:"));
  const totalIndex = lines.findIndex((line) => line.startsWith("Total:"));
  const bowlingHeader = lines.indexOf("No Bowler O M R W 0s 4s 6s WD NB Eco");
  const toBatIndex = lines.findIndex((line) => line.startsWith("To Bat:"));
  const fowIndex = lines.indexOf("Fall of Wickets");

  assertAnchor(battingHeader, "batting");
  assertAnchor(extrasIndex, "extras");
  assertAnchor(totalIndex, "total");
  assertAnchor(bowlingHeader, "bowling");
  if (extrasIndex <= battingHeader) throw parserError(`innings ${inningsNumber} batting section is not readable.`);
  const extras = parseExtras(lines[extrasIndex]);
  const total = parseTotal(lines[totalIndex]);
  const batting = lines.slice(battingHeader + 1, extrasIndex).map((line) => parseBattingRow(line, inningsId, battingTeam));
  const bowlingRowsEnd = toBatIndex > -1 ? toBatIndex : fowIndex;
  if (bowlingRowsEnd <= bowlingHeader) throw parserError(`innings ${inningsNumber} bowling section is not readable.`);
  const bowling = lines.slice(bowlingHeader + 1, bowlingRowsEnd).map((line) => parseBowlingRow(line, inningsId, bowlingTeam ?? ""));
  const didNotBat = toBatIndex > -1 ? lines[toBatIndex].replace("To Bat:", "").split(",").map(normalizePlayerName).filter(Boolean) : [];
  const fowEnd = lines.findIndex((line, index) => index > fowIndex && FOOTER_RE.test(line));
  const fallOfWickets = fowIndex > -1 ? parseFallOfWickets(lines.slice(fowIndex + 1, fowEnd > -1 ? fowEnd : undefined)) : [];

  return {
    id: inningsId,
    inningsNumber,
    battingTeam,
    bowlingTeam: bowlingTeam ?? "",
    totalRuns: total.runs,
    totalWickets: total.wickets,
    overs: total.overs,
    crr: total.crr,
    extrasTotal: extras.total,
    extrasWide: extras.wide,
    extrasNoball: extras.noball,
    extrasBye: extras.bye,
    extrasLegbye: extras.legbye,
    batting,
    bowling,
    didNotBat,
    fallOfWickets
  };
}

export function parseMatchDetails(pageText: string) {
  const lines = cleanLines(pageText);
  const leagueName = lines[0] ?? "Local Cricket";
  const resultText = readLabelValue(lines, "Result") ?? "";
  const dateLine = readLabelValue(lines, "Date");
  const [matchDate, matchTime] = dateLine ? dateLine.replace(" UTC", "").split(", ") : [];
  const ground = readGround(lines);
  const tossValue = readLabelValue(lines, "Toss") ?? lines.find((line) => line.includes("Toss ")) ?? "";
  const tossMatch = tossValue.match(/(?:Toss\s+)?(.+?)\s+opt to\s+(.+)$/i);
  const winnerTeam = resultText.match(/^(.+?)\s+won/i)?.[1];
  const winMarginText = resultText.match(/won by\s+(.+)$/i)?.[1];
  return {
    leagueName,
    resultText,
    matchDate,
    matchTime,
    ground,
    tossWinner: tossMatch?.[1],
    tossDecision: tossMatch ? `opt to ${tossMatch[2]}` : undefined,
    winnerTeam,
    winMarginText
  };
}

function readLabelValue(lines: string[], label: string): string | undefined {
  const inline = lines.find((line) => line.startsWith(`${label} `));
  if (inline) return inline.replace(new RegExp(`^${label}\\s+`), "").trim();
  const index = lines.findIndex((line) => line === label);
  if (index === -1) return undefined;
  return lines[index + 1]?.trim();
}

function readGround(lines: string[]): string | undefined {
  const inline = lines.find((line) => line.startsWith("Ground "));
  if (inline) return inline.replace(/^Ground\s+/, "").trim();
  const index = lines.findIndex((line) => line === "Ground");
  if (index === -1) return undefined;
  const parts: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (/^(Result|Date|Best Performances|DOMINATORS \d+\/\d+|HURRICANES \d+\/\d+)/.test(line)) break;
    parts.push(line);
    if (parts.length >= 2) break;
  }
  return parts.join(" ").trim() || undefined;
}

function rekeyInnings(inn: Innings, matchId: string) {
  const oldId = inn.id;
  const newId = id("inn", matchId, inn.inningsNumber);
  inn.id = newId;
  inn.batting = inn.batting.map((b) => ({ ...b, id: b.id.replace(oldId, newId), inningsId: newId }));
  inn.bowling = inn.bowling.map((b) => ({ ...b, id: b.id.replace(oldId, newId), inningsId: newId }));
}

export function parseMatchFromPages(pages: string[], sourcePdfFilename?: string): Match {
  if (pages.length < 3) throw parserError("expected a multi-page CricHeroes scorecard PDF.");
  const detailsPage = pages[0] ?? "";
  const squadPage = pages.find((page) => page.includes("Playing Squad")) ?? "";
  const inningsPages = pages.filter((page) => page.includes("No Batsman Status R B M 4s 6s SR") && page.includes("No Bowler O M R W 0s 4s 6s WD NB Eco"));
  if (inningsPages.length < 2) throw parserError("could not find both innings scorecard pages.");

  const details = parseMatchDetails(detailsPage);
  const inningsOne = parseInnings(inningsPages[0], 1);
  const inningsTwo = parseInnings(inningsPages[1], 2, inningsOne.battingTeam);
  inningsOne.bowlingTeam = inningsTwo.battingTeam;
  inningsOne.bowling = inningsOne.bowling.map((row) => ({ ...row, team: inningsOne.bowlingTeam }));
  inningsTwo.bowling = inningsTwo.bowling.map((row) => ({ ...row, team: inningsTwo.bowlingTeam }));
  const squads = squadPage ? parseSquads(squadPage, inningsOne.battingTeam, inningsTwo.battingTeam) : [];

  const fingerprint = createMatchFingerprint(details.matchDate, inningsOne, inningsTwo, sourcePdfFilename);
  const matchId = id("match", fingerprint);

  // Regenerate sub-IDs scoped to this match so they are unique across matches
  rekeyInnings(inningsOne, matchId);
  rekeyInnings(inningsTwo, matchId);

  return {
    id: matchId,
    fingerprint,
    leagueName: details.leagueName,
    matchDate: details.matchDate,
    matchTime: details.matchTime,
    ground: details.ground,
    teamA: inningsOne.battingTeam,
    teamB: inningsTwo.battingTeam,
    tossWinner: details.tossWinner,
    tossDecision: details.tossDecision,
    resultText: details.resultText,
    winnerTeam: details.winnerTeam,
    winMarginText: details.winMarginText,
    sourcePdfFilename,
    squads,
    innings: [inningsOne, inningsTwo],
    createdAt: new Date().toISOString()
  };
}

export function createMatchFingerprint(matchDate: string | undefined, inningsOne: Innings, inningsTwo: Innings, sourcePdfFilename?: string): string {
  const matchNum = sourcePdfFilename ? extractMatchNumber(sourcePdfFilename) : null;
  const teams = [inningsOne.battingTeam, inningsTwo.battingTeam].map((team) => String(team).toUpperCase()).sort().join("-vs-");
  const scores = [inningsOne, inningsTwo]
    .map((innings) => `${String(innings.battingTeam).toUpperCase()}:${innings.totalRuns}/${innings.totalWickets}/${innings.overs}`)
    .sort()
    .join("|");
  const base = matchNum ?? matchDate ?? "unknown-date";
  return id("fp", base, teams, scores);
}

function extractMatchNumber(filename: string): string | null {
  const digits = filename.replace(/\.pdf$/i, "").match(/\d+/g);
  if (!digits) return null;
  const long = digits.filter((d) => d.length >= 5);
  if (long.length) return long[0];
  return digits[digits.length - 1];
}
