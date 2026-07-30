export function normalizePlayerName(rawName: string): string {
  return rawName
    .replace(/\(\s*[cC]\s*\)/g, "")
    .replace(/\((RHB|LHB)\)/gi, "")
    .replace(/[†‡]/g, "") // CricHeroes wicketkeeper markers (e.g. "st †Shitanshu Saini b Ashish")
    .replace(/\s+/g, " ")
    .trim();
}

export function playerIdFromName(rawName: string): string {
  return normalizePlayerName(rawName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function classifyDismissal(raw: string) {
  const text = raw.trim().toLowerCase();
  if (text === "not out") return "not_out" as const;
  if (text.startsWith("retired hurt")) return "retired_hurt" as const;
  if (text.startsWith("retired not out")) return "retired_not_out" as const;
  if (text.startsWith("run out")) return "run_out" as const;
  if (text.startsWith("lbw")) return "lbw" as const;
  if (text.startsWith("st ")) return "stumped" as const;
  if (text.startsWith("hit wicket")) return "hit_wicket" as const;
  if (text.startsWith("b ")) return "bowled" as const;
  if (text.startsWith("c ") && text.includes(" b ")) return "caught" as const;
  return "other" as const;
}

export function oversToBalls(overs: string): number {
  const [whole, balls = "0"] = overs.toString().split(".");
  return Number(whole) * 6 + Number(balls);
}

export function ballsToOversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function formatAverage(runs: number, dismissals: number): string {
  if (dismissals === 0) return "-";
  return (runs / dismissals).toFixed(2);
}
