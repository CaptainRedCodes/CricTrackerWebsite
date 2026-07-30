import { describe, expect, it } from "vitest";
import { samplePages } from "../data/sampleText";
import { classifyDismissal, normalizePlayerName, oversToBalls } from "./cricket";
import { parseBattingRow, parseBowlingRow, parseExtras, parseFallOfWickets, parseMatchFromPages, parseTotal } from "./parser";

describe("cricket helpers", () => {
  it("normalizes player names", () => {
    expect(normalizePlayerName("Sughosh Rao ( C )")).toBe("Sughosh Rao");
    expect(normalizePlayerName("Shreyas S (c) (RHB)")).toBe("Shreyas S");
    expect(normalizePlayerName("†Shitanshu Saini")).toBe("Shitanshu Saini");
  });

  it("classifies common dismissals", () => {
    expect(classifyDismissal("not out")).toBe("not_out");
    expect(classifyDismissal("b Niraj Subedi")).toBe("bowled");
    expect(classifyDismissal("run out Gaurav")).toBe("run_out");
    expect(classifyDismissal("retired hurt")).toBe("retired_hurt");
  });

  it("converts cricket overs to balls", () => {
    expect(oversToBalls("4.3")).toBe(27);
    expect(oversToBalls("7.0")).toBe(42);
  });
});

describe("row parsers", () => {
  it("parses batting rows from the right", () => {
    const row = parseBattingRow("1 Shreyas S (c) (RHB) run out Gaurav 67 27 14 3 8 248.15");
    expect(row.playerNameRaw).toBe("Shreyas S");
    expect(row.isCaptain).toBe(true);
    expect(row.dismissalRaw).toBe("run out Gaurav");
    expect(row.runs).toBe(67);
    expect(row.sixes).toBe(8);
  });

  it("parses batting rows when batting style is missing", () => {
    const row = parseBattingRow("3 New Player not out 12 8 6 1 1 150.00");
    expect(row.playerNameRaw).toBe("New Player");
    expect(row.battingStyle).toBeUndefined();
    expect(row.dismissalType).toBe("not_out");
  });

  it("fails clearly for bad row shapes", () => {
    expect(() => parseBowlingRow("1 Someone 2 0 nope")).toThrow("Could not import scorecard");
  });

  it("parses bowling rows from the right", () => {
    const row = parseBowlingRow("2 Sughosh Rao (c) 2 0 36 0 5 2 4 2 1 18.00");
    expect(row.playerNameRaw).toBe("Sughosh Rao");
    expect(row.isCaptain).toBe(true);
    expect(row.overs).toBe("2");
    expect(row.runsConceded).toBe(36);
    expect(row.economy).toBe(18);
  });

  it("parses extras, totals, and fall of wickets", () => {
    expect(parseExtras("Extras: (wd 4, nb 1) 5")).toEqual({ total: 5, wide: 4, noball: 1, bye: 0, legbye: 0 });
    expect(parseTotal("Total: Overs 7.0, Wickets 1 97 (CRR: 13.86)")).toEqual({ overs: "7.0", wickets: 1, runs: 97, crr: 13.86 });
    expect(parseFallOfWickets(["97-1 (Shreyas S, 7 ov)"])).toEqual([{ scoreAtFall: 97, wicketNumber: 1, batterOut: "Shreyas S", over: "7" }]);
    expect(parseFallOfWickets(["-"])).toEqual([]);
  });
});

describe("full sample scorecard", () => {
  it("parses the provided CricHeroes sample", () => {
    const match = parseMatchFromPages(samplePages, "sample.pdf");
    expect(match.resultText).toBe("HURRICANES won by 32 runs");
    expect(match.innings).toHaveLength(2);

    const inningsOne = match.innings[0];
    expect(inningsOne.battingTeam).toBe("HURRICANES");
    expect(inningsOne.totalRuns).toBe(97);
    expect(inningsOne.totalWickets).toBe(1);
    expect(inningsOne.extrasTotal).toBe(5);
    expect(inningsOne.extrasWide).toBe(4);
    expect(inningsOne.extrasNoball).toBe(1);
    expect(inningsOne.bowling).toHaveLength(4);
    expect(inningsOne.fallOfWickets[0]).toEqual({ scoreAtFall: 97, wicketNumber: 1, batterOut: "Shreyas S", over: "7" });

    const shreyas = inningsOne.batting[0];
    expect(shreyas.playerNameRaw).toBe("Shreyas S");
    expect(shreyas.runs).toBe(67);
    expect(shreyas.balls).toBe(27);
    expect(shreyas.fours).toBe(3);
    expect(shreyas.sixes).toBe(8);
    expect(shreyas.strikeRate).toBe(248.15);
    expect(shreyas.dismissalRaw).toBe("run out Gaurav");
    expect(shreyas.isCaptain).toBe(true);
  });

  it("does not depend on fixed page numbers", () => {
    const match = parseMatchFromPages([samplePages[0], "unused page", samplePages[2], samplePages[1], samplePages[3]], "sample.pdf");
    expect(match.squads).toHaveLength(12);
    expect(match.innings[0].battingTeam).toBe("HURRICANES");
    expect(match.innings[1].battingTeam).toBe("DOMINATORS");
  });
});
