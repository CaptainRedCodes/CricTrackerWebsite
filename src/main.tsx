import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Award, BarChart3, CalendarDays, CheckCircle2, Cloud, Database, Home, ShieldCheck, Swords, UploadCloud, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Match, TrackerState } from "./types";
import { appendMatch, findDuplicateMatch, loadState, saveState } from "./lib/storage";
import { isSupabaseConfigured, loadRemoteState, saveRemoteMatch } from "./lib/supabase";
import { boundaryStats, dashboardStats, fieldingStats, matchTrend, mvpStats, playerBattingStats, playerBowlingStats, teamStats } from "./lib/stats";
import { extractPdfPages } from "./lib/pdf";
import { parseMatchFromPages } from "./lib/parser";
import "./styles.css";

const chartColors = {
  hurricanes: "#2563eb",
  dominators: "#f97316",
  runs: "#0f766e",
  wickets: "#7c3aed",
  extras: "#f59e0b"
};

const AppContext = createContext<{ state: TrackerState; addMatch: (match: Match) => Promise<void>; ready: boolean; status: string } | null>(null);

function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Missing app context");
  return context;
}

function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(loadState);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [status, setStatus] = useState(isSupabaseConfigured ? "Connecting to Supabase..." : "Local browser storage");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    loadRemoteState()
      .then((remoteState) => {
        if (!active) return;
        setState(remoteState);
        setStatus("Supabase connected");
      })
      .catch((error) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "Supabase unavailable, using local data");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const addMatch = async (match: Match) => {
    const next = isSupabaseConfigured ? await saveRemoteMatch(state, match) : appendMatch(state, match);
    if (!isSupabaseConfigured) saveState(next);
    setState(next);
  };
  return <AppContext.Provider value={{ state, addMatch, ready, status }}>{children}</AppContext.Provider>;
}

function Layout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/teamlogos/Hurricanes.png" alt="Hurricanes" />
          <div>
            <strong>SL Tracker</strong>
            <span>Hurricanes vs Dominators</span>
          </div>
          <img src="/teamlogos/dominators.png" alt="Dominators" />
        </div>
        <nav>
          <NavLink to="/"><Home size={20} /> Dashboard</NavLink>
          <NavLink to="/matches"><CalendarDays size={20} /> Matches</NavLink>
          <NavLink to="/players"><Users size={20} /> Players</NavLink>
          <NavLink to="/teams"><BarChart3 size={20} /> Teams</NavLink>
          <NavLink to="/upload"><UploadCloud size={20} /> Upload</NavLink>
        </nav>
        <StorageBadge />
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function StorageBadge() {
  const { status } = useApp();
  return (
    <div className="storageBadge">
      {isSupabaseConfigured ? <Cloud size={18} /> : <Database size={18} />}
      <span>{status}</span>
    </div>
  );
}

function Dashboard() {
  const { state, ready } = useApp();
  const stats = dashboardStats(state.matches);
  const trend = matchTrend(state.matches);
  const batting = playerBattingStats(state.matches).slice(0, 6);
  const bowling = playerBowlingStats(state.matches).slice(0, 6);
  const teams = teamStats(state.matches);

  return (
    <Page title="Dashboard" action={<Link className="button" to="/upload">Upload scorecard</Link>}>
      {!ready && <section className="panel noticePanel">Loading tournament data...</section>}
      {ready && state.matches.length === 0 && (
        <section className="emptyState">
          <UploadCloud size={44} />
          <h2>No matches imported yet</h2>
          <p>Upload the first CricHeroes Summary Scorecard PDF to generate scorecards, stats, leaderboards, and charts.</p>
          <Link className="button primaryButton" to="/upload">Upload first scorecard</Link>
        </section>
      )}
      {state.matches.length > 0 && (
        <>
      <section className="scoreHero">
        <div className="teamTile">
          <img src="/teamlogos/Hurricanes.png" alt="Hurricanes" />
          <strong>HURRICANES</strong>
          <span>{teams.find((team) => team.team === "HURRICANES")?.wins ?? 0} wins</span>
        </div>
        <div className="heroCenter">
          <span className="statusPill">Head to head</span>
          <strong>{stats.matchesPlayed} matches</strong>
          <p>{stats.latestMatch?.resultText ?? "Upload a scorecard to begin tracking the tournament."}</p>
        </div>
        <div className="teamTile">
          <img src="/teamlogos/dominators.png" alt="Dominators" />
          <strong>DOMINATORS</strong>
          <span>{teams.find((team) => team.team === "DOMINATORS")?.wins ?? 0} wins</span>
        </div>
      </section>

      <div className="summaryGrid rich">
        <Metric icon={<Swords size={22} />} label="Most runs" value={stats.topBatter?.name ?? "-"} sub={stats.topBatter ? `${stats.topBatter.runs} runs, SR ${stats.topBatter.strikeRate}` : ""} />
        <Metric icon={<ShieldCheck size={22} />} label="Most wickets" value={stats.topBowler?.name ?? "-"} sub={stats.topBowler ? `${stats.topBowler.wickets} wickets, Eco ${stats.topBowler.economy}` : ""} />
        <Metric icon={<Award size={22} />} label="MVP leader" value={stats.topMvp?.name ?? "-"} sub={stats.topMvp ? `${stats.topMvp.points} points` : ""} />
        <Metric icon={<Users size={22} />} label="Fielding impact" value={stats.topFielder?.name ?? "-"} sub={stats.topFielder ? `${stats.topFielder.total} catches/run-outs` : ""} />
      </div>

      <div className="dashboardGrid">
        <section className="panel chartPanel wide">
          <PanelHeading title="Runs By Match" meta="team totals" />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e6ece7" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={12} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" />
                <Line type="monotone" dataKey="HURRICANES" stroke={chartColors.hurricanes} strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 7 }} connectNulls />
                <Line type="monotone" dataKey="DOMINATORS" stroke={chartColors.dominators} strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 7 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel leaderboardPanel">
          <PanelHeading title="Top Run Scorers" meta="season" />
          <MiniBars data={batting} labelKey="name" valueKey="runs" />
        </section>
        <section className="panel leaderboardPanel">
          <PanelHeading title="Top Wicket Takers" meta="season" />
          <MiniBars data={bowling} labelKey="name" valueKey="wickets" />
        </section>
        <section className="panel chartPanel wide">
          <PanelHeading title="Match Pressure" meta="extras and wickets" />
          <div className="chart">
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="extrasFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.extras} stopOpacity={0.38} />
                    <stop offset="95%" stopColor={chartColors.extras} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="wicketsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.wickets} stopOpacity={0.32} />
                    <stop offset="95%" stopColor={chartColors.wickets} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e6ece7" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={12} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="extras" stroke={chartColors.extras} strokeWidth={3} fill="url(#extrasFill)" />
                <Area type="monotone" dataKey="wickets" stroke={chartColors.wickets} strokeWidth={3} fill="url(#wicketsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
        </>
      )}
    </Page>
  );
}

function Matches() {
  const { state } = useApp();
  return (
    <Page title="Matches">
      {state.matches.length === 0 && <section className="emptyState"><CalendarDays size={42} /><h2>No matches yet</h2><p>Imported scorecards will appear here.</p></section>}
      <div className="list">
        {state.matches.map((match) => (
          <Link className="matchRow" to={`/matches/${match.id}`} key={match.id}>
            <div>
              <strong>{match.teamA} vs {match.teamB}</strong>
              <span>{match.matchDate} · {match.ground}</span>
            </div>
            <div className="scorePills">{match.innings.map((i) => <span key={i.id}>{i.battingTeam} {i.totalRuns}/{i.totalWickets}</span>)}</div>
            <div className="resultText">{match.resultText}</div>
          </Link>
        ))}
      </div>
    </Page>
  );
}

function MatchDetail() {
  const { id } = useParams();
  const { state } = useApp();
  const match = state.matches.find((item) => item.id === id);
  if (!match) return <Page title="Match not found"><p>No match found.</p></Page>;
  return (
    <Page title={`${match.teamA} vs ${match.teamB}`}>
      <section className="panel details">
        <div><strong>Date</strong><span>{match.matchDate} {match.matchTime}</span></div>
        <div><strong>Ground</strong><span>{match.ground}</span></div>
        <div><strong>Toss</strong><span>{match.tossWinner} {match.tossDecision}</span></div>
        <div><strong>Result</strong><span>{match.resultText}</span></div>
      </section>
      {match.innings.map((innings) => (
        <section className="panel" key={innings.id}>
          <div className="inningsHeader">
            <div>
              <span>Innings {innings.inningsNumber}</span>
              <h2>{innings.battingTeam}</h2>
            </div>
            <strong>{innings.totalRuns}/{innings.totalWickets} <small>({innings.overs} Ov)</small></strong>
          </div>
          <DataTable headers={["Batter", "Status", "R", "B", "4s", "6s", "SR"]} rows={innings.batting.map((row) => [row.playerNameRaw, row.dismissalRaw, row.runs, row.balls, row.fours, row.sixes, row.strikeRate])} />
          <p className="small">Extras: {innings.extrasTotal} · To bat: {innings.didNotBat.join(", ") || "-"}</p>
          <h3>Bowling</h3>
          <DataTable headers={["Bowler", "O", "M", "R", "W", "0s", "WD", "NB", "Eco"]} rows={innings.bowling.map((row) => [row.playerNameRaw, row.overs, row.maidens, row.runsConceded, row.wickets, row.dotBalls, row.wides, row.noballs, row.economy])} />
          <p className="small">Fall of wickets: {innings.fallOfWickets.map((fow) => `${fow.scoreAtFall}-${fow.wicketNumber} (${fow.batterOut}, ${fow.over} ov)`).join(", ") || "-"}</p>
        </section>
      ))}
    </Page>
  );
}

function Players() {
  const { state } = useApp();
  const [tab, setTab] = useState("runs");
  const batting = playerBattingStats(state.matches);
  const bowling = playerBowlingStats(state.matches);
  const mvp = mvpStats(state.matches);
  const fielding = fieldingStats(state.matches);
  const boundaries = boundaryStats(state.matches);
  const economy = [...bowling].sort((a, b) => Number(a.economy) - Number(b.economy));
  const average = [...batting].sort((a, b) => Number(b.average === "-" ? -1 : b.average) - Number(a.average === "-" ? -1 : a.average));

  const tabs = [
    { id: "runs", label: "Runs" },
    { id: "wickets", label: "Wickets" },
    { id: "mvp", label: "MVP" },
    { id: "fielding", label: "Catches/Run-outs" },
    { id: "boundaries", label: "4s & 6s" },
    { id: "economy", label: "Economy" },
    { id: "average", label: "Average" }
  ];

  return (
    <Page title="Player Stats">
      <div className="tabs" role="tablist" aria-label="Player stat categories">
        {tabs.map((item) => (
          <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button">
            {item.label}
          </button>
        ))}
      </div>
      {tab === "runs" && (
        <StatsPanel title="Most Runs" headers={["Player", "Inn", "Runs", "Avg", "SR", "HS", "4s", "6s"]} rows={batting.map((p) => [p.name, p.innings, p.runs, p.average, p.strikeRate, p.highScore, p.fours, p.sixes])} chartData={batting.slice(0, 8)} valueKey="runs" />
      )}
      {tab === "wickets" && (
        <StatsPanel title="Most Wickets" headers={["Player", "Overs", "Wkts", "Eco", "Avg", "SR", "Dots", "Best"]} rows={bowling.map((p) => [p.name, p.overs, p.wickets, p.economy, p.average, p.strikeRate, p.dotBalls, p.bestFigures])} chartData={bowling.slice(0, 8)} valueKey="wickets" />
      )}
      {tab === "mvp" && (
        <StatsPanel title="MVP Points" headers={["Player", "Points", "Runs", "Wickets", "Fielding", "Sixes", "Dots"]} rows={mvp.map((p) => [p.name, p.points, p.runs, p.wickets, p.fielding, p.sixes, p.dots])} chartData={mvp.slice(0, 8)} valueKey="points" />
      )}
      {tab === "fielding" && (
        <StatsPanel title="Catches And Run-outs" headers={["Player", "Total", "Catches", "Run-outs", "Stumpings"]} rows={fielding.map((p) => [p.name, p.total, p.catches, p.runOuts, p.stumpings])} chartData={fielding.slice(0, 8)} valueKey="total" />
      )}
      {tab === "boundaries" && (
        <StatsPanel title="Boundaries" headers={["Player", "Boundaries", "Boundary Runs", "4s", "6s", "Runs"]} rows={boundaries.map((p) => [p.name, p.boundaries, p.boundaryRuns, p.fours, p.sixes, p.runs])} chartData={boundaries.slice(0, 8)} valueKey="boundaries" />
      )}
      {tab === "economy" && (
        <StatsPanel title="Best Economy" headers={["Player", "Overs", "Eco", "Runs", "Wkts", "Dots", "WD", "NB"]} rows={economy.map((p) => [p.name, p.overs, p.economy, p.runsConceded, p.wickets, p.dotBalls, p.wides, p.noballs])} chartData={economy.slice(0, 8)} valueKey="economy" />
      )}
      {tab === "average" && (
        <StatsPanel title="Batting Average" headers={["Player", "Avg", "Runs", "Dismissals", "Not outs", "Inn", "SR"]} rows={average.map((p) => [p.name, p.average, p.runs, p.dismissals, p.notOuts, p.innings, p.strikeRate])} chartData={average.filter((p) => p.average !== "-").slice(0, 8)} valueKey="average" />
      )}
      <section className="panel mutedPanel">
        <h2>Complete Tables</h2>
        <p className="small">The tabs above show focused leaderboards. Full batting and bowling tables are kept here for quick checking.</p>
      </section>
      <section className="panel">
        <h2>Batting</h2>
        <DataTable headers={["Player", "Inn", "Runs", "Avg", "SR", "HS", "4s", "6s"]} rows={batting.map((p) => [p.name, p.innings, p.runs, p.average, p.strikeRate, p.highScore, p.fours, p.sixes])} />
      </section>
      <section className="panel">
        <h2>Bowling</h2>
        <DataTable headers={["Player", "Overs", "Wkts", "Eco", "Avg", "SR", "Dots", "Best"]} rows={bowling.map((p) => [p.name, p.overs, p.wickets, p.economy, p.average, p.strikeRate, p.dotBalls, p.bestFigures])} />
      </section>
    </Page>
  );
}

function StatsPanel({ title, headers, rows, chartData, valueKey }: { title: string; headers: string[]; rows: Array<Array<React.ReactNode>>; chartData: any[]; valueKey: string }) {
  return (
    <section className="panel chartPanel">
      <PanelHeading title={title} meta="leaderboard" />
      <div className="statsSplit">
        <div className="chart compactChart">
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, left: 26, bottom: 8 }}>
              <CartesianGrid stroke="#e6ece7" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" width={118} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey={valueKey} fill={chartColors.runs} radius={[0, 8, 8, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DataTable headers={headers} rows={rows} />
      </div>
    </section>
  );
}

function PanelHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="panelHeading">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chartTooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.name}>
          <span style={{ background: item.color }} />
          {item.name}: <b>{item.value}</b>
        </div>
      ))}
    </div>
  );
}

function MiniBars({ data, labelKey, valueKey }: { data: any[]; labelKey: string; valueKey: string }) {
  return (
    <div className="miniBars">
      {data.map((item) => {
        const max = Math.max(...data.map((entry) => Number(entry[valueKey]) || 0), 1);
        const value = Number(item[valueKey]) || 0;
        return (
          <div className="miniBar" key={item.playerId ?? item[labelKey]}>
            <div><strong>{item[labelKey]}</strong><span>{value}</span></div>
            <progress value={value} max={max} />
          </div>
        );
      })}
    </div>
  );
}

function Teams() {
  const { state } = useApp();
  const teams = teamStats(state.matches);
  const trend = state.matches.flatMap((match) => match.innings.map((innings) => ({
    name: `${match.matchDate} ${innings.battingTeam}`,
    runs: innings.totalRuns,
    team: innings.battingTeam
  }))).reverse();
  return (
    <Page title="Team Stats">
      <div className="summaryGrid">{teams.map((team) => <Metric key={team.team} label={team.team} value={`${team.wins}-${team.losses}`} sub={`Avg ${team.averageScore}, RR ${team.runRate}`} />)}</div>
      <section className="panel">
        <PanelHeading title="Runs Trend" meta="innings scores" />
        <div className="chart">
          <ResponsiveContainer>
            <LineChart data={trend} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e6ece7" vertical={false} />
              <XAxis dataKey="name" hide />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="runs" stroke={chartColors.runs} strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel">
        <DataTable headers={["Team", "Matches", "Wins", "Losses", "Runs", "High", "Low", "Extras"]} rows={teams.map((t) => [t.team, t.matches, t.wins, t.losses, t.runs, t.highest, t.lowest, t.extras])} />
      </section>
    </Page>
  );
}

function Upload() {
  const { state, addMatch } = useApp();
  const [preview, setPreview] = useState<Match | null>(null);
  const [message, setMessage] = useState("");
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setPreview(null);
    setDuplicateMessage("");
    setBusy(true);
    setMessage("");
    if (file.type && file.type !== "application/pdf") {
      setMessage("Please upload a PDF scorecard.");
      setBusy(false);
      return;
    }
    try {
      const pages = await extractPdfPages(file);
      const parsed = parseMatchFromPages(pages, file.name);
      const duplicate = findDuplicateMatch(state, parsed);
      if (duplicate) {
        setDuplicateMessage(`Already imported: ${duplicate.teamA} vs ${duplicate.teamB} on ${duplicate.matchDate ?? "unknown date"}.`);
      }
      setPreview(parsed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not parse this PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      await addMatch(preview);
      setMessage("Match imported successfully.");
      setDuplicateMessage("");
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this match.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Upload Scorecard">
      <section className="uploadHero">
        <div>
          <UploadCloud size={38} />
          <h2>Upload CricHeroes PDF</h2>
          <p>Choose the Summary Scorecard PDF. The app extracts the text, previews the score, checks duplicates, then saves the match.</p>
        </div>
        <label className="fileDrop">
          <input type="file" accept="application/pdf" onChange={(event) => onFile(event.target.files?.[0])} />
          <span>Select PDF scorecard</span>
        </label>
        {busy && <p>Reading PDF...</p>}
        {message && <p className="notice">{message}</p>}
        {duplicateMessage && <p className="notice danger">{duplicateMessage}</p>}
      </section>
      {preview && (
        <section className="panel previewPanel">
          <div className="previewHeader">
            <div>
              <h2>Preview</h2>
              <p><strong>{preview.teamA} vs {preview.teamB}</strong></p>
              <p>{preview.matchDate} · {preview.ground}</p>
              <p>{preview.resultText}</p>
            </div>
            <CheckCircle2 size={42} />
          </div>
          <DataTable headers={["Team", "Score", "Overs"]} rows={preview.innings.map((i) => [i.battingTeam, `${i.totalRuns}/${i.totalWickets}`, i.overs])} />
          <button className="button primaryButton" onClick={confirm} disabled={Boolean(duplicateMessage) || busy}>Confirm import</button>
        </section>
      )}
    </Page>
  );
}

function Page({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Tournament tracker</span>
          <h1>{title}</h1>
        </div>
        {action}
      </header>
      {children}
    </>
  );
}

function Metric({ icon, label, value, sub }: { icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return <section className="metric">{icon && <div className="metricIcon">{icon}</div>}<span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</section>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  const table = useMemo(() => ({ headers, rows }), [headers, rows]);
  return (
    <div className="tableWrap">
      <table>
        <thead><tr>{table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Layout />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
