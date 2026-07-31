import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, Cloud, Database, Handshake, Home, MapPin, Menu, RefreshCw, Shield, Swords, X, Target, TrendingUp, Trophy, UploadCloud, Users, Zap, Command } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Innings, Match, TrackerState } from "./types";
import { appendMatch, findDuplicateMatch, loadState, saveState } from "./lib/storage";
import { isSupabaseConfigured, loadRemoteState, saveRemoteMatch } from "./lib/supabase";
import {
  batterScatter, bowlerScatter, boundaryStats, dashboardStats, fieldingBreakdown, fieldingStats, groundStats, inningsWorm, matchRunRates, matchTrend, matchWorm, mvpStats, playerBattingStats, playerBowlingStats, playerFormSeries, runsComposition, teamForAgainst, teamStats, teamWinRate
} from "./lib/stats";
import { extractPdfPages } from "./lib/pdf";
import { parseMatchFromPages } from "./lib/parser";
import "./styles.css";

/* ──────── shared chart constants ──────── */
const HUR = "#3b82f6";
const DOM = "#f97316";
const RUNS = "#22c55e";
const WKTS = "#8b5cf6";
const EXTRAS = "#f59e0b";
const GOLDE = "#fbbf24";
const GRID = "#1b2633";
const MUTED = "#6b7a8d";
const axisTick = { fill: MUTED, fontSize: 11 };

const AppContext = createContext<{ state: TrackerState; addMatch: (m: Match) => Promise<void>; ready: boolean; status: string; refetch: () => Promise<void> } | null>(null);
const useApp = () => { const c = useContext(AppContext); if (!c) throw new Error("ctx"); return c; };

function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(loadState);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [status, setStatus] = useState(isSupabaseConfigured ? "Connecting..." : "Local");

  const fetchRemote = async () => {
    if (!isSupabaseConfigured) { setReady(true); return; }
    try {
      const r = await loadRemoteState();
      setState(r);
      setStatus(r.matches.length ? "Supabase" : "No data");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Not connected");
    }
    setReady(true);
  };

  useEffect(() => { let a = true; fetchRemote().finally(() => { if (a) setReady(true); }); return () => { a = false; }; }, []);

  const addMatch = async (m: Match) => {
    const nxt = isSupabaseConfigured ? await saveRemoteMatch(state, m) : appendMatch(state, m);
    if (!isSupabaseConfigured) saveState(nxt);
    setState(nxt);
  };
  return <AppContext.Provider value={{ state, addMatch, ready, status, refetch: fetchRemote }}>{children}</AppContext.Provider>;
}

/* ──────── layout ──────── */
function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "U") { e.preventDefault(); navigate("/upload"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/teamlogos/Hurricanes.png" alt="HUR" />
          <div><strong>SL Tracker</strong><span>Tournament Analytics</span></div>
          <img src="/teamlogos/dominators.png" alt="DOM" />
        </div>
        <nav className={`navLinks${menuOpen ? " open" : ""}`}>
          <NavLink to="/"><Home size={16} /> Overview</NavLink>
          <NavLink to="/matches"><CalendarDays size={16} /> Matches</NavLink>
          <NavLink to="/players"><Users size={16} /> Players</NavLink>
          <NavLink to="/teams"><BarChart3 size={16} /> Teams</NavLink>
          <NavLink to="/grounds"><MapPin size={16} /> Grounds</NavLink>
          <NavLink to="/upload" className="uploadNav"><UploadCloud size={16} /> Upload</NavLink>
        </nav>
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <StorageBadge />
      </aside>
      <main onClick={() => setMenuOpen(false)}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/grounds" element={<Grounds />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function StorageBadge() {
  const { status } = useApp();
  return <div className="storageBadge">{isSupabaseConfigured ? <Cloud size={15} /> : <Database size={15} />} {status}</div>;
}

/* ──────── DASHBOARD ──────── */
function Dashboard() {
  const { state, ready, status, refetch } = useApp();
  const s = dashboardStats(state.matches);
  const rr = matchRunRates(state.matches);
  const batting = playerBattingStats(state.matches).slice(0, 6);
  const bowling = playerBowlingStats(state.matches).slice(0, 6);
  const hur = teamWinRate(state.matches, "HURRICANES");
  const dom = teamWinRate(state.matches, "DOMINATORS");
  const allComp = runsComposition(state.matches);
  const latest = s.latestMatch;

  return (
    <Page title="Overview" action={<Link className="button primaryButton" to="/upload"><UploadCloud size={16} /> Import scorecard</Link>}>
      {!ready && <section className="notice noticePanel">Preparing tournament data...</section>}
      {ready && state.matches.length === 0 && isSupabaseConfigured && (
        <section className="emptyState">
          <Cloud size={48} />
          <h2>Could not load data</h2>
          <p>{status !== "Supabase" && status !== "No data" ? status : "No matches found. Try refreshing or importing a scorecard."}</p>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="button" onClick={refetch}><RefreshCw size={14} /> Retry</button>
            <Link className="button primaryButton" to="/upload">Import scorecard</Link>
          </div>
        </section>
      )}
      {ready && state.matches.length === 0 && !isSupabaseConfigured && (
        <section className="emptyState">
          <Database size={48} />
          <h2>No matches imported</h2>
          <p>Upload CricHeroes Summary Scorecard PDFs to build stats, leaderboards, and performance trends. Data is stored in your browser.</p>
          <Link className="button primaryButton" to="/upload">Import first scorecard</Link>
        </section>
      )}
      {state.matches.length > 0 && (<>
        {/* ── HERO with win-rate radial gauges ── */}
        <section className="scoreHero">
          <div className="teamTile">
            <img src="/teamlogos/Hurricanes.png" alt="Hurricanes" className="teamLogo" />
            <strong>HURRICANES</strong>
            <span>{hur.wins}W · {hur.losses}L · {s.matchesPlayed} played</span>
            <RadialGauge value={hur.rate} size={100} color={HUR} centerText={`${Math.round(hur.rate * 100)}%`} centerSub="WIN RATE" />
          </div>
          <div className="heroCenter">
            <span className="statusPill">HEAD TO HEAD</span>
            <div className="heroCount">{s.matchesPlayed}</div>
            <div className="heroLabel">matches played</div>
            {latest && <p className="heroRecent">{latest.teamA} <b>{latest.innings[0].totalRuns}/{latest.innings[0].totalWickets}</b>  —  {latest.teamB} <b>{latest.innings[1].totalRuns}/{latest.innings[1].totalWickets}</b></p>}
            {latest && <p className="heroResult">{latest.resultText}</p>}
          </div>
          <div className="teamTile">
            <img src="/teamlogos/dominators.png" alt="Dominators" className="teamLogo" />
            <strong>DOMINATORS</strong>
            <span>{dom.wins}W · {dom.losses}L · {s.matchesPlayed} played</span>
            <RadialGauge value={dom.rate} size={100} color={DOM} centerText={`${Math.round(dom.rate * 100)}%`} centerSub="WIN RATE" />
          </div>
        </section>

        {/* ── KEY METRICS ── */}
        <div className="summaryGrid">
          <MetricCard icon={<Swords size={18} />} tone="runs" label="Top Scorer" value={s.topBatter?.name ?? "-"} sub={s.topBatter ? `${s.topBatter.runs} runs · SR ${s.topBatter.strikeRate}` : ""} />
          <MetricCard icon={<Shield size={18} />} tone="wickets" label="Top Wicket-taker" value={s.topBowler?.name ?? "-"} sub={s.topBowler ? `${s.topBowler.wickets} wkts · Eco ${s.topBowler.economy}` : ""} />
          <MetricCard icon={<Trophy size={18} />} tone="mvp" label="MVP Leader" value={s.topMvp?.name ?? "-"} sub={s.topMvp ? `${s.topMvp.points} pts` : ""} />
          <MetricCard icon={<Handshake size={18} />} tone="fielding" label="Best Fielder" value={s.topFielder?.name ?? "-"} sub={s.topFielder ? `${s.topFielder.total} dismissals` : ""} />
        </div>

        {/* ── RUN-RATE MOMENTUM (full width) ── */}
        <section className="panel chartPanel">
          <PanelHeading title="Run-rate momentum" meta="scoring pace per match" />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={rr} margin={{ top: 14, right: 24, left: -4, bottom: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axisTick} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tick={axisTick} width={36} tickFormatter={(v) => `${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="rect" wrapperStyle={{ paddingTop: 14 }} />
                <Line type="monotone" dataKey="HURRICANES" stroke={HUR} strokeWidth={2.5} dot={{ r: 4, fill: HUR }} activeDot={{ r: 7 }} connectNulls label={{ position: "top", fill: MUTED, fontSize: 10, fontWeight: 700, formatter: (v:number) => v }} />
                <Line type="monotone" dataKey="DOMINATORS" stroke={DOM} strokeWidth={2.5} dot={{ r: 4, fill: DOM }} activeDot={{ r: 7 }} connectNulls label={{ position: "top", fill: MUTED, fontSize: 10, fontWeight: 700, formatter: (v:number) => v }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── COMPOSITION DONUT + LATEST WORM ── */}
        <div className="dashboardGrid">
          <section className="panel chartPanel">
            <PanelHeading title="How runs are scored" meta="boundary breakdown" />
            <Donut data={allComp} />
            <Legend2 items={allComp} />
          </section>
          <section className="panel chartPanel">
            <PanelHeading title="Latest match — innings progression" meta={latest ? `${latest.teamA} vs ${latest.teamB}` : ""} />
            {latest && <WormMatch innings={latest.innings} />}
          </section>
        </div>

        {/* ── FORM LEADERBOARDS with sparklines ── */}
        <div className="dashboardGrid" style={{ marginTop: 14 }}>
          <section className="panel leaderboardPanel">
            <PanelHeading title="Top run-scorers" meta="season form" />
            <FormBars data={batting} valueKey="runs" suffix="runs" color={RUNS} />
          </section>
          <section className="panel leaderboardPanel">
            <PanelHeading title="Top wicket-takers" meta="season form" />
            <FormBars data={bowling} valueKey="wickets" suffix="wkts" color={WKTS} />
          </section>
        </div>
      </>)}
      <div style={{ textAlign: "center", padding: "24px 0 0" }}>
        <span className="kbd" title="Import scorecards"><Command size={10} /> <span>Ctrl</span> + <span>Shift</span> + <span>U</span></span>
      </div>
    </Page>
  );
}

/* ──────── MATCHES ──────── */
function Matches() {
  const { state } = useApp();
  return (
    <Page title="Match history">
      {state.matches.length === 0 && <section className="emptyState"><CalendarDays size={42} /><h2>No matches yet</h2><p>Imported scorecards show up here.</p></section>}
      <div className="list">
        {state.matches.map(m => {
          const won = m.winnerTeam;
          const maxRuns = Math.max(...m.innings.map(i => i.totalRuns), 1);
          return (
            <Link className="matchRow" to={`/matches/${m.id}`} key={m.id}>
              <div className="matchTeams">
                <strong>{m.teamA}</strong>
                <span className="vs">vs</span>
                <strong>{m.teamB}</strong>
                <div className="matchMeta">{m.matchDate} · {m.ground}</div>
              </div>
              <div className="scorePills">
                {m.innings.map(i => (
                  <span key={i.id} className={`pill pillBar ${won === i.battingTeam ? "win" : ""}`}>
                    <span className="pillName">{i.battingTeam}</span>
                    <span className="pillScore">{i.totalRuns}/{i.totalWickets}</span>
                    <span className="pillBarTrack"><span className="pillBarFill" style={{ width: `${(i.totalRuns / maxRuns) * 100}%`, background: i.battingTeam === "HURRICANES" ? HUR : DOM }} /></span>
                  </span>
                ))}
              </div>
              <div className="resultText">{m.resultText}</div>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}

/* ──────── MATCH DETAIL ──────── */
function MatchDetail() {
  const { id } = useParams();
  const { state } = useApp();
  const m = state.matches.find(x => x.id === id);
  if (!m) return <Page title="Not found"><p>Match not found.</p></Page>;
  return (
    <Page title={`${m.teamA} vs ${m.teamB}`}>
      <section className="panel details">
        <div><strong>Date</strong><span>{m.matchDate} {m.matchTime}</span></div>
        <div><strong>Ground</strong><span>{m.ground}</span></div>
        <div><strong>Toss</strong><span>{m.tossWinner} {m.tossDecision}</span></div>
        <div><strong>Result</strong><span>{m.resultText}</span></div>
      </section>
      <section className="panel chartPanel" style={{ marginBottom: 20 }}>
        <PanelHeading title="Innings progression" meta="both innings overlaid" />
        <MatchWormChart {...matchWorm(m.innings)} />
      </section>
      {m.innings.map(inn => (
        <section className="panel" key={inn.id}>
          <div className="inningsHeader">
            <div><span>INNINGS {inn.inningsNumber}</span><h2>{inn.battingTeam}</h2></div>
            <strong>{inn.totalRuns}/{inn.totalWickets} <small>({inn.overs} ov · CRR {inn.crr})</small></strong>
          </div>
          <div style={{ marginTop: 4, marginBottom: 4 }}>
            <h3>Run contribution</h3>
          </div>
          <BattingContribution innings={inn} />
          <h3 style={{ marginTop: 18 }}>Batting</h3>
          <DataTable headers={["Batter", "Status", "R", "B", "4s", "6s", "SR"]} rows={inn.batting.map(r => [r.playerNameRaw, r.dismissalRaw, r.runs, r.balls, r.fours, r.sixes, r.strikeRate])} />
          <p className="small">Extras: {inn.extrasTotal} (wd {inn.extrasWide}, nb {inn.extrasNoball}, b {inn.extrasBye}, lb {inn.extrasLegbye}) · Did not bat: {inn.didNotBat.join(", ") || "-"}</p>
          <h3 style={{ marginTop: 18 }}>Bowling</h3>
          <DataTable headers={["Bowler", "O", "M", "R", "W", "0s", "WD", "NB", "Eco"]} rows={inn.bowling.map(r => [r.playerNameRaw, r.overs, r.maidens, r.runsConceded, r.wickets, r.dotBalls, r.wides, r.noballs, r.economy])} />
          <p className="small">Fall of wickets: {inn.fallOfWickets.map(f => `${f.scoreAtFall}-${f.wicketNumber} (${f.batterOut}, ${f.over} ov)`).join("  ·  ") || "none"}</p>
        </section>
      ))}
    </Page>
  );
}

/* ──────── PLAYERS ──────── */
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
    { id: "runs", label: "Runs" }, { id: "wickets", label: "Wickets" }, { id: "mvp", label: "MVP" },
    { id: "fielding", label: "Fielding" }, { id: "boundaries", label: "4s & 6s" },
    { id: "economy", label: "Economy" }, { id: "average", label: "Average" }
  ];

  // form sparkline column injected into batting/wicket tables
  const formCell = (pid: string) => <Sparkline data={playerFormSeries(state.matches, pid)} color={RUNS} />;

  return (
    <Page title="Player statistics">
      <div className="tabs" role="tablist">
        {tabs.map(t => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)} type="button">{t.label}</button>)}
      </div>

      {tab === "runs" && (
        <>
          <StatsPanel title="Most runs" headers={["Player", "Form", "Inn", "Runs", "Avg", "SR", "HS", "4s", "6s"]} rows={batting.map(p => [p.name, formCell(p.playerId), p.innings, p.runs, p.average, p.strikeRate, p.highScore, p.fours, p.sixes])} chartData={batting.slice(0, 8)} valueKey="runs" barColor={RUNS} />
          <section className="panel chartPanel" style={{ marginTop: 14 }}>
            <PanelHeading title="Batters: runs vs strike rate" meta="comparison" />
            <p className="caption">Top-right = high volume & fast scoring. Left = anchor batsman, high right = power hitter.</p>
            <RunsVsSRScatter data={batterScatter(state.matches)} />
          </section>
        </>
      )}
      {tab === "wickets" && (
        <>
          <StatsPanel title="Most Wickets" headers={["Player", "Overs", "Wkts", "Eco", "Avg", "SR", "Dots", "Best"]} rows={bowling.map(p => [p.name, p.overs, p.wickets, p.economy, p.average, p.strikeRate, p.dotBalls, p.bestFigures])} chartData={bowling.slice(0, 8)} valueKey="wickets" barColor={WKTS} />
          <section className="panel chartPanel" style={{ marginTop: 14 }}>
            <PanelHeading title="Bowlers: economy vs wickets" meta="bubble size = dot-ball %" />
            <p className="caption">Top-left = economical & wicket-taking (best). Bottom-right = expensive & low impact.</p>
            <EconomyWicketsScatter data={bowlerScatter(state.matches)} />
          </section>
        </>
      )}
      {tab === "mvp" && <StatsPanel title="MVP Points" headers={["Player", "Points", "Runs", "Wkts", "Fielding", "Sixes", "Dots"]} rows={mvp.map(p => [p.name, p.points, p.runs, p.wickets, p.fielding, p.sixes, p.dots])} chartData={mvp.slice(0, 8)} valueKey="points" barColor={GOLDE} />}
      {tab === "fielding" && (
        <>
          <StatsPanel title="Fielding dismissals" headers={["Player", "Total", "Catches", "Run-outs", "Stumpings"]} rows={fielding.map(p => [p.name, p.total, p.catches, p.runOuts, p.stumpings])} chartData={fielding.slice(0, 8)} valueKey="total" barColor={HUR} />
          <section className="panel chartPanel" style={{ marginTop: 14 }}>
            <PanelHeading title="Dismissal type breakdown" meta="catches · run-outs · stumpings" />
            <DismissalBreakdown data={fieldingBreakdown(state.matches)} />
          </section>
        </>
      )}
      {tab === "boundaries" && <StatsPanel title="Boundary Hitters" headers={["Player", "Boundaries", "Boundary Runs", "4s", "6s", "Runs"]} rows={boundaries.map(p => [p.name, p.boundaries, p.boundaryRuns, p.fours, p.sixes, p.runs])} chartData={boundaries.slice(0, 8)} valueKey="boundaries" barColor={EXTRAS} />}
      {tab === "economy" && <StatsPanel title="Best Economy" headers={["Player", "Overs", "Eco", "Runs", "Wkts", "Dots", "WD", "NB"]} rows={economy.map(p => [p.name, p.overs, p.economy, p.runsConceded, p.wickets, p.dotBalls, p.wides, p.noballs])} chartData={economy.slice(0, 8)} valueKey="economy" barColor={RUNS} />}
      {tab === "average" && <StatsPanel title="Batting average" headers={["Player", "Avg", "Runs", "Dismissals", "NO", "Inn", "SR"]} rows={average.map(p => [p.name, p.average, p.runs, p.dismissals, p.notOuts, p.innings, p.strikeRate])} chartData={average.filter(p => p.average !== "-").slice(0, 8)} valueKey="average" barColor={EXTRAS} />}

      <div className="panel" style={{ marginTop: 14, padding: "14px 24px", display:"flex", alignItems:"center", gap: 12 }}>
        <span style={{ color: "var(--text-dim)", fontSize: ".78rem", fontWeight: 600 }}>Full stats for every player:</span>
        <a href="#full-batting" className="button" style={{ fontSize: ".76rem", padding: "5px 12px", minHeight: "unset" }}>Batting table</a>
        <a href="#full-bowling" className="button" style={{ fontSize: ".76rem", padding: "5px 12px", minHeight: "unset" }}>Bowling table</a>
      </div>

      <section className="panel" id="full-batting">
        <h2 style={{ marginBottom: 10 }}>Full batting table</h2>
        <DataTable headers={["Player", "Form", "Inn", "Runs", "Avg", "SR", "HS", "4s", "6s"]} rows={batting.map(p => [p.name, formCell(p.playerId), p.innings, p.runs, p.average, p.strikeRate, p.highScore, p.fours, p.sixes])} />
      </section>
      <section className="panel" id="full-bowling">
        <h2 style={{ marginBottom: 10 }}>Full bowling table</h2>
        <DataTable headers={["Player", "Overs", "Wkts", "Eco", "Avg", "SR", "Dots", "Best"]} rows={bowling.map(p => [p.name, p.overs, p.wickets, p.economy, p.average, p.strikeRate, p.dotBalls, p.bestFigures])} />
      </section>
    </Page>
  );
}

function StatsPanel({ title, headers, rows, chartData, valueKey, barColor }: { title: string; headers: string[]; rows: Array<Array<React.ReactNode>>; chartData: any[]; valueKey: string; barColor: string }) {
  return (
    <section className="panel chartPanel">
      <PanelHeading title={title} meta="leaderboard" />
      <div className="statsSplit">
        <div className="chart compactChart">
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis dataKey="name" type="category" width={104} tickLine={false} axisLine={false} tick={axisTick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey={valueKey} fill={barColor} radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DataTable headers={headers} rows={rows} />
      </div>
    </section>
  );
}

/* ──────── TEAMS ──────── */
function Teams() {
  const { state } = useApp();
  const teams = teamStats(state.matches);
  const hur = teamWinRate(state.matches, "HURRICANES");
  const dom = teamWinRate(state.matches, "DOMINATORS");
  const rr = matchRunRates(state.matches);
  const hurComp = runsComposition(state.matches, "HURRICANES");
  const domComp = runsComposition(state.matches, "DOMINATORS");
  const fa = teamForAgainst(state.matches);

  return (
    <Page title="Team performance">
      <section className="panel h2hPanel">
        <div className="h2hSide">
          <img src="/teamlogos/Hurricanes.png" alt="Hurricanes" className="teamLogo lg" />
          <strong>HURRICANES</strong>
          <span>{hur.wins}W · {hur.losses}L</span>
          <RadialGauge value={hur.rate} size={100} stroke={8} color={HUR} centerText={`${Math.round(hur.rate * 100)}%`} centerSub="WIN RATE" />
        </div>
        <div className="h2hMid">
          <span className="statusPill">HEAD TO HEAD</span>
          <div className="h2hScore">{hur.wins} <small>—</small> {dom.wins}</div>
          <div className="h2hPips">
            {[...state.matches].reverse().map((m, i) => (
              <span key={i} className={`pip ${m.winnerTeam === "HURRICANES" ? "h" : m.winnerTeam === "DOMINATORS" ? "d" : "n"}`} title={`${m.teamA} vs ${m.teamB} — ${m.resultText}`}>{m.winnerTeam === "HURRICANES" ? "H" : m.winnerTeam === "DOMINATORS" ? "D" : "—"}</span>
            ))}
          </div>
        </div>
        <div className="h2hSide">
          <img src="/teamlogos/dominators.png" alt="Dominators" className="teamLogo lg" />
          <strong>DOMINATORS</strong>
          <span>{dom.wins}W · {dom.losses}L</span>
          <RadialGauge value={dom.rate} size={100} stroke={8} color={DOM} centerText={`${Math.round(dom.rate * 100)}%`} centerSub="WIN RATE" />
        </div>
      </section>

      <section className="panel chartPanel">
        <PanelHeading title="Runs for vs against" meta="cumulative tournament totals" />
        <ForAgainstChart data={fa} />
      </section>

      <div className="dashboardGrid">
        <section className="panel chartPanel">
          <PanelHeading title="Hurricanes — run sources" meta="how runs come" />
          <Donut data={hurComp} />
          <Legend2 items={hurComp} />
        </section>
        <section className="panel chartPanel">
          <PanelHeading title="Dominators — run sources" meta="how runs come" />
          <Donut data={domComp} />
          <Legend2 items={domComp} />
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <DataTable headers={["Team", "Matches", "Wins", "Losses", "Runs", "Highest", "Lowest", "Avg", "RR", "Extras"]} rows={teams.map(t => [t.team, t.matches, t.wins, t.losses, t.runs, t.highest, t.lowest, t.averageScore, t.runRate, t.extras])} />
      </section>
    </Page>
  );
}

/* ──────── GROUNDS ──────── */
function Grounds() {
  const { state } = useApp();
  const grounds = groundStats(state.matches);

  return (
    <Page title="Ground stats">
      {state.matches.length === 0 && <section className="emptyState"><MapPin size={42} /><h2>No match data</h2><p>Ground statistics appear after you import scorecards.</p></section>}
      {grounds.length > 0 && (
        <>
          <section className="panel chartPanel">
            <PanelHeading title="Matches by venue" meta={`${grounds.length} venues`} />
            <div className="chart" style={{ height: grounds.length > 1 ? 280 : 120 }}>
              <ResponsiveContainer>
                <BarChart data={grounds} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} />
                  <YAxis dataKey="ground" type="category" width={140} tickLine={false} axisLine={false} tick={axisTick} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="matches" fill={HUR} radius={[0, 6, 6, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {grounds.map(g => (
            <section className="panel" key={g.ground}>
              <PanelHeading title={g.ground} meta={`${g.matches} match${g.matches > 1 ? "es" : ""}`} />
              <div className="groundGrid">
                <div className="groundStat"><span>Avg runs/match</span><strong>{g.avgRuns}</strong></div>
                <div className="groundStat"><span>Highest score</span><strong>{g.highest}</strong></div>
                <div className="groundStat"><span>Lowest score</span><strong>{g.lowest}</strong></div>
                <div className="groundStat"><span>Avg wickets</span><strong>{g.avgWickets}</strong></div>
                <div className="groundStat"><span>Top team</span><strong>{g.topWinsTeam} <small>({g.topWinsCount}W)</small></strong></div>
                <div className="groundStat"><span>Best bowling</span><strong>{g.bestBowler} <small>({g.bestFigures}wkts)</small></strong></div>
              </div>
              {g.lastMatch && <p className="small">Last match: {g.lastMatch}</p>}
            </section>
          ))}
        </>
      )}
    </Page>
  );
}

/* ──────── UPLOAD ──────── */
function Upload() {
  const { state, addMatch } = useApp();
  const [preview, setPreview] = useState<Match | null>(null);
  const [message, setMessage] = useState("");
  const [dup, setDup] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setPreview(null); setDup(""); setBusy(true); setMessage("");
    if (file.type && file.type !== "application/pdf") { setMessage("Please upload a PDF."); setBusy(false); return; }
    try {
      const pages = await extractPdfPages(file);
      const parsed = parseMatchFromPages(pages, file.name);
      const d = findDuplicateMatch(state, parsed);
      if (d) setDup(`Duplicate: ${d.teamA} vs ${d.teamB} on ${d.matchDate ?? "unknown"}`);
      setPreview(parsed);
    } catch (e: any) { setMessage(e instanceof Error ? e.message : "Could not parse PDF."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!preview) return; setBusy(true);
    try { await addMatch(preview); setMessage("Imported successfully."); setDup(""); setPreview(null); }
    catch (e: any) { setMessage(e instanceof Error ? e.message : "Save failed."); }
    finally { setBusy(false); }
  }

  return (
    <Page title="Import scorecard">
      <section className="uploadHero">
        <div>
          <UploadCloud size={34} />
          <h2>Upload CricHeroes PDF</h2>
          <p>Select a Summary Scorecard PDF. The tracker extracts match data, previews, checks duplicates, and saves it.</p>
        </div>
        <label className="fileDrop">
          <input type="file" accept="application/pdf" onChange={e => onFile(e.target.files?.[0])} />
          <span>Choose PDF</span>
        </label>
      </section>
      {busy && <p className="notice">Reading PDF…</p>}
      {message && <p className={message.includes("success") ? "notice" : "notice danger"}>{message}</p>}
      {dup && <p className="notice danger">{dup}</p>}
      {preview && (
        <section className="panel previewPanel">
          <div className="previewHeader">
            <div>
              <h2>Preview</h2>
              <p><strong>{preview.teamA} vs {preview.teamB}</strong></p>
              <p>{preview.matchDate} · {preview.ground}</p>
              <p>{preview.resultText}</p>
            </div>
            <CheckCircle2 size={38} />
          </div>
          <DataTable headers={["Team", "Score", "Overs", "CRR"]} rows={preview.innings.map(i => [i.battingTeam, `${i.totalRuns}/${i.totalWickets}`, i.overs, i.crr])} />
          <button className="button primaryButton" onClick={confirm} disabled={!!dup || busy} style={{ marginTop: 14 }}>Confirm Import</button>
        </section>
      )}
    </Page>
  );
}

/* ════════ SHARED PRIMITIVES ════════ */
function Page({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (<>
    <header className="pageHeader">
      <div><span className="eyebrow">HURRICANES VS DOMINATORS</span><h1>{title}</h1></div>
      {action}
    </header>
    {children}
  </>);
}

function PanelHeading({ title, meta }: { title: string; meta?: string }) {
  return <div className="panelHeading"><h2>{title}</h2>{meta && <span>{meta}</span>}</div>;
}

function MetricCard({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: "runs" | "wickets" | "mvp" | "fielding"; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <section className="metric">
      <div className={`metricIcon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </section>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chartTooltip">
      {label !== undefined && <strong>{label}</strong>}
      {payload.map((p: any) => (
        <div key={p.name}>
          <span style={{ background: p.color || p.fill || p.payload?.color }} />
          {p.name}: <b>{p.value}</b>
        </div>
      ))}
    </div>
  );
}

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="chartTooltip">
      <strong>{p.name}</strong>
      <div><b>{p.economy}</b> economy</div>
      <div><b>{p.wickets}</b> wickets</div>
      <div><b>{p.dotPct}%</b> dots</div>
    </div>
  );
}

function BatterScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="chartTooltip">
      <strong>{p.name}</strong>
      <div><b>{p.runs}</b> runs</div>
      <div><b>{p.strikeRate}</b> strike rate</div>
      <div><b>{p.innings}</b> innings</div>
    </div>
  );
}

/* — sparkline (pure SVG) — */
function Sparkline({ data, color = RUNS, width = 78, height = 24 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return <span className="sparkEmpty">—</span>;
  if (data.length < 2) return <span className="sparkSingle">{data[0]}</span>;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = 2 + (i / (data.length - 1)) * (width - 4);
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${(width - 2).toFixed(1)},${(height - 1).toFixed(1)} L2,${(height - 1).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  const gid = `sl-${color.replace("#", "")}-${Math.round(last[0])}`;
  return (
    <svg width={width} height={height} className="sparkline" role="img" aria-label={`form: ${data.join(", ")}`}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.32" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

/* — radial gauge (pure SVG) — */
function RadialGauge({ value, max = 1, size = 120, stroke = 9, color, centerText, centerSub }: { value: number; max?: number; size?: number; stroke?: number; color: string; centerText?: string; centerSub?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max ? Math.min(value / max, 1) : 0;
  const offset = circ * (1 - pct);
  const half = size / 2;
  return (
    <div className="radialGauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={half} cy={half} r={r} fill="none" stroke="var(--bg-input)" strokeWidth={stroke} />
        <circle cx={half} cy={half} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${half} ${half})`} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        {centerText && <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="gaugeValue">{centerText}</text>}
        {centerSub && <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" className="gaugeSub">{centerSub}</text>}
      </svg>
    </div>
  );
}

/* — donut chart — */
function Donut({ data, height = 200 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ height, position: "relative" }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={3} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donutCenter"><strong>{total}</strong><span>total runs</span></div>
    </div>
  );
}

function Legend2({ items }: { items: { name: string; value: number; color: string }[] }) {
  const total = items.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="donutLegend">
      {items.map(d => (
        <div key={d.name}><span style={{ background: d.color }} />{d.name} <b>{d.value}</b><small>({Math.round((d.value / total) * 100)}%)</small></div>
      ))}
    </div>
  );
}

/* — worm chart for a match's innings (both innings side by side) — */
function WormMatch({ innings }: { innings: Innings[] }) {
  return (
    <div className="wormGrid">
      {innings.map(inn => {
        const data = inningsWorm(inn);
        const color = inn.battingTeam === "HURRICANES" ? HUR : DOM;
        return (
          <div key={inn.id} className="wormCell">
            <div className="wormTitle"><span style={{ background: color }} />{inn.battingTeam} {inn.totalRuns}/{inn.totalWickets}</div>
            <WormChart data={data} color={color} height={180} />
          </div>
        );
      })}
    </div>
  );
}

function WormChart({ data, color, height = 220 }: { data: any[]; color: string; height?: number }) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 16, left: -10, bottom: 2 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
          <XAxis type="number" dataKey="over" domain={[0, "dataMax"]} tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v) => `${v} ov`} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={34} />
          <Tooltip content={<WormTooltip />} />
          <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2.5} dot={{ r: 3.5, fill: color, stroke: "var(--bg-card)", strokeWidth: 1 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WormTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="chartTooltip">
      <strong>{p.final ? "End of innings" : p.wicket === 0 ? "Innings start" : `Wicket ${p.wicket}`}</strong>
      <div>Score: <b>{p.score}</b></div>
      {p.overText && p.overText !== "0" && <div>Over: <b>{p.overText}</b></div>}
      {p.batter && <div>Out: <b>{p.batter}</b></div>}
    </div>
  );
}

/* — combined match worm (both innings on one chart) — */
function MatchWormChart({ data, teams }: { data: any[]; teams: string[] }) {
  const colors: Record<string, string> = { "HURRICANES": HUR, "DOMINATORS": DOM };

  // Use two passes per team so dots only appear on the owning team's points
  return (
    <div className="chart" style={{ height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 16, left: -10, bottom: 2 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="4 4" vertical={false} />
          <XAxis type="number" dataKey="over" domain={[0, "dataMax"]} tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v) => `${v} ov`} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={34} />
          <Legend iconType="rect" wrapperStyle={{ paddingTop: 10 }} formatter={(v: string) => <span style={{ color: colors[v] || "#888", fontWeight: 700 }}>{v}</span>} />
          <Tooltip content={<MatchWormTooltip teams={teams} />} />
          {/* lines with connectNulls so each team's line hops over the other's points */}
          {teams.map(t => (
            <Line key={`line-${t}`} type="monotone" dataKey={t} stroke={colors[t] || "#888"} strokeWidth={2.5} strokeDasharray=""
              connectNulls dot={false} activeDot={false} />
          ))}
          {/* invisible lines that only render dots — one per team */}
          {teams.map(t => (
            <Line key={`dot-${t}`} type="monotone" dataKey={t} stroke="transparent"
              connectNulls={false}
              dot={(dotProps: any) => {
                const { cx, cy, payload: row } = dotProps;
                if (row == null || row[t] == null) return <></>;
                const isFinal = row[`${t}_final`];
                return (
                  <circle cx={cx} cy={cy}
                    r={isFinal ? 3 : 4}
                    fill={isFinal ? "transparent" : colors[t]}
                    stroke={isFinal ? colors[t] : "var(--bg-card)"}
                    strokeWidth={isFinal ? 2 : 1.5}
                    strokeDasharray={isFinal ? "3 2" : ""} />
                );
              }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MatchWormTooltip({ active, payload, teams }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="chartTooltip">
      <strong>Over {row.overText}</strong>
      {teams.map((t: string) => {
        const val = row[t];
        if (val == null) return null;
        const w = row[`${t}_wicket`];
        const b = row[`${t}_batter`];
        const f = row[`${t}_final`];
        return (
          <div key={t} style={{ marginTop: 3 }}>
            <div><span style={{ background: t === "HURRICANES" ? HUR : DOM }} />{t} <b>{val}</b></div>
            {!f && b ? <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", paddingLeft: 15 }}>Out: {b} (W {w})</div>
              : f ? <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", paddingLeft: 15 }}>Innings end</div>
              : null}
          </div>
        );
      })}
    </div>
  );
}

/* — economy vs wickets scatter — */
function EconomyWicketsScatter({ data }: { data: { name: string; economy: number; wickets: number; overs: string; dotPct: number }[] }) {
  return (
    <div className="chart" style={{ height: 290 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 24, left: -6, bottom: 22 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="4 4" />
          <XAxis type="number" dataKey="economy" name="Economy" tickLine={false} axisLine={false} tick={axisTick} domain={["dataMin - 1", "dataMax + 1"]} label={{ value: "Economy →", position: "insideBottom", offset: -10, fill: MUTED, fontSize: 11 }} />
          <YAxis type="number" dataKey="wickets" name="Wickets" tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} label={{ value: "Wickets", angle: -90, position: "insideLeft", fill: MUTED, fontSize: 11 }} />
          <ZAxis dataKey="dotPct" range={[50, 240]} name="Dot %" />
          <Tooltip content={<ScatterTooltip />} cursor={{ stroke: MUTED, strokeDasharray: "4 4" }} />
          <Scatter data={data} fill={WKTS} fillOpacity={0.55} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* — form bars with sparkline per row — */
function FormBars({ data, valueKey, suffix, color }: { data: any[]; valueKey: string; suffix: string; color: string }) {
  const { state } = useApp();
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className="formBars">
      {data.map(item => {
        const v = Number(item[valueKey]) || 0;
        return (
          <div className="formBar" key={item.playerId ?? item.name}>
            <div className="formBarHead">
              <strong>{item.name}</strong>
              <Sparkline data={playerFormSeries(state.matches, item.playerId, 6)} color={color} width={70} height={20} />
              <span>{v} {suffix}</span>
            </div>
            <progress value={v} max={max} style={{ ["--bar" as any]: color }} />
          </div>
        );
      })}
    </div>
  );
}

/* — batting contribution (horizontal stacked bars per innings) — */
function BattingContribution({ innings }: { innings: Innings }) {
  const total = innings.totalRuns || 1;
  const color = innings.battingTeam === "HURRICANES" ? HUR : DOM;
  return (
    <div className="contribBars">
      {innings.batting.map(b => {
        const pct = (b.runs / total) * 100;
        return (
          <div className="contribBar" key={b.id}>
            <span className="contribName">{b.playerNameRaw}</span>
            <span className="contribTrack">
              <span className="contribFill" style={{ width: `${pct}%`, background: color }} />
            </span>
            <span className="contribVal">{b.runs} <small>({pct.toFixed(1)}%)</small></span>
          </div>
        );
      })}
    </div>
  );
}

/* — runs vs strike rate scatter — */
function RunsVsSRScatter({ data }: { data: { name: string; runs: number; strikeRate: number; innings: number }[] }) {
  return (
    <div className="chart" style={{ height: 290 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 24, left: -4, bottom: 22 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="4 4" />
          <XAxis type="number" dataKey="runs" name="Runs" tickLine={false} axisLine={false} tick={axisTick} domain={["dataMin - 5", "dataMax + 5"]} label={{ value: "Runs →", position: "insideBottom", offset: -10, fill: MUTED, fontSize: 11 }} />
          <YAxis type="number" dataKey="strikeRate" name="SR" tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} label={{ value: "Strike rate", angle: -90, position: "insideLeft", fill: MUTED, fontSize: 11 }} />
          <Tooltip content={<BatterScatterTooltip />} cursor={{ stroke: MUTED, strokeDasharray: "4 4" }} />
          <Scatter data={data} fill={HUR} fillOpacity={0.45} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* — dismissal breakdown (stacked horizontal bars) — */
function DismissalBreakdown({ data }: { data: { name: string; catches: number; runOuts: number; stumpings: number }[] }) {
  return (
    <div className="chart" style={{ height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="4 4" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis dataKey="name" type="category" width={104} tickLine={false} axisLine={false} tick={axisTick} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="catches" fill={HUR} radius={[4, 0, 0, 4]} stackId="a" barSize={20} />
          <Bar dataKey="runOuts" fill={DOM} stackId="a" />
          <Bar dataKey="stumpings" fill={RUNS} radius={[0, 4, 4, 0]} stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* — for vs against chart — */
function ForAgainstChart({ data }: { data: { team: string; scored: number; conceded: number }[] }) {
  const max = Math.max(...data.flatMap(d => [d.scored, d.conceded]), 1);
  return (
    <div className="faGrid">
      {data.map(d => (
        <div className="faRow" key={d.team}>
          <strong className="faTeam">{d.team}</strong>
          <div className="faBarGroup">
            <div className="faBarLabel">Scored</div>
            <div className="faTrack">
              <div className="faFill scored" style={{ width: `${(d.scored / max) * 100}%`, background: d.team === "HURRICANES" ? HUR : DOM }} />
            </div>
            <span className="faVal">{d.scored}</span>
          </div>
          <div className="faBarGroup">
            <div className="faBarLabel">Conceded</div>
            <div className="faTrack">
              <div className="faFill conceded" style={{ width: `${(d.conceded / max) * 100}%`, background: "#ef4444" }} />
            </div>
            <span className="faVal">{d.conceded}</span>
          </div>
          <div className="faDiff" style={{ color: d.scored > d.conceded ? RUNS : d.scored < d.conceded ? "#ef4444" : "var(--text-dim)" }}>
            {d.scored > d.conceded ? "+" : d.scored < d.conceded ? "-" : ""}{Math.abs(d.scored - d.conceded)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* — data table — */
function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  const t = useMemo(() => ({ headers, rows }), [headers, rows]);
  return (
    <div className="tableWrap">
      <table>
        <thead><tr>{t.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
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