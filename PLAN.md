# Hurricanes vs Dominators Cricket Tournament Tracker Plan

## 1. Goal

Build a simple web app for tracking a local cricket tournament between the Hurricanes and Dominators.

The app must let the user upload the CricHeroes "Summary Scorecard" PDF after every match, extract all useful match information from the PDF text layer, save it, and show clear scorecards, standings, player stats, team stats, graphs, and insights.

Important requirements:

- Players can appear for either team across different matches.
- New players can be added automatically when they appear in uploaded PDFs.
- PDF parsing must use direct text extraction only. Do not use OCR.
- The UI should be simple, readable, and easy to navigate for visitors above 35.
- The existing workspace has:
  - `samplepdf/Summary Scorecard 26291013.pdf`
  - `teamlogos/Hurricanes.png`
  - `teamlogos/dominators.png`

## 2. Recommended Tech Stack

Use a modern but small stack:

- Frontend: React + Vite + TypeScript
- Styling: plain CSS modules or Tailwind CSS with restrained design tokens
- Charts: Recharts
- PDF text extraction: `pdfjs-dist`
- Local development database: SQLite via Prisma, or Supabase later
- Production database: Supabase Postgres
- Hosting: Vercel

Recommended implementation path:

1. Build locally with a deterministic parser and local seed/sample data first.
2. Add database persistence.
3. Add upload preview and confirm flow.
4. Deploy.

This keeps the parsing and stats logic testable before connecting external services.

## 3. Core App Pages

### 3.1 Home / Dashboard

Purpose: fast overview for everyone.

Show:

- Hurricanes and Dominators logos
- latest match result
- total matches played
- team wins
- current head-to-head record
- top run scorer
- top wicket taker
- best individual score
- best bowling figures
- button to upload a new scorecard

Design:

- large readable text
- high contrast
- simple tabs or left navigation
- no cluttered hero/marketing section

### 3.2 Matches

Show a list of all uploaded matches.

Each row/card:

- date
- ground
- team scores
- result
- top performer summary
- link to full scorecard

Filters:

- team
- date range
- result winner

### 3.3 Match Scorecard

Show full scorecard for one match.

Sections:

- match details: date, time, ground, toss, result
- innings 1 batting table
- innings 1 bowling table
- innings 1 extras, total, fall of wickets, did-not-bat list
- innings 2 batting table
- innings 2 bowling table
- innings 2 extras, total, fall of wickets, did-not-bat list

Use tables because cricket users expect scorecards in table form.

### 3.4 Player Stats

Show season/tournament player leaderboards.

Batting:

- runs
- innings
- dismissals
- average
- strike rate
- highest score
- balls faced
- fours
- sixes
- not outs
- 30+ scores
- 50+ scores

Bowling:

- overs
- wickets
- runs conceded
- economy
- bowling average
- strike rate
- dot balls
- maidens
- wides
- no-balls
- best figures

Fielding/dismissal insights if enough data is available:

- run outs involved
- most dismissed by bowler
- dismissal type breakdown

### 3.5 Team Stats

Show:

- matches played
- wins/losses
- total runs
- average score
- highest score
- lowest score
- run rate
- wickets taken
- wickets lost
- extras conceded
- toss decisions and outcomes

Graphs:

- team scores over time
- win trend
- average run rate by team
- extras conceded by team
- wickets per match

### 3.6 Upload Scorecard

Flow:

1. User uploads a CricHeroes Summary Scorecard PDF.
2. App extracts text using `pdfjs-dist`.
3. Parser turns text into structured match data.
4. User sees a preview:
   - match date/time
   - teams
   - scores
   - squads
   - batting rows
   - bowling rows
   - extras
   - fall of wickets
5. User confirms import.
6. App saves the match and updates all stats.

If the PDF has no extractable text, stop and show:

> This PDF does not contain extractable text. The CricHeroes export format may have changed.

Do not silently fall back to OCR.

## 4. Data Model

Use these entities.

### players

- id
- canonical_name
- aliases_json
- created_at
- updated_at

Players are independent from teams because a player may play for Hurricanes in one match and Dominators in another.

### teams

- id
- name
- logo_path

Initial teams:

- Hurricanes
- Dominators

### matches

- id
- match_date
- match_time
- ground
- league_name
- team_a
- team_b
- toss_winner
- toss_decision
- result_text
- winner_team
- win_margin_text
- source_pdf_filename
- created_at

### match_squads

- id
- match_id
- team_id
- player_id
- player_name_raw
- is_captain

### innings

- id
- match_id
- innings_number
- batting_team_id
- bowling_team_id
- total_runs
- total_wickets
- overs_text
- crr
- extras_total
- extras_wide
- extras_noball
- extras_bye
- extras_legbye

Store overs as text where the value represents cricket overs, such as `4.3`.

### batting_performances

- id
- innings_id
- order_no
- player_id
- player_name_raw
- team_id
- is_captain
- batting_style
- dismissal_raw
- dismissal_type
- runs
- balls
- minutes
- fours
- sixes
- strike_rate

### bowling_performances

- id
- innings_id
- order_no
- player_id
- player_name_raw
- team_id
- is_captain
- overs_text
- maidens
- runs_conceded
- wickets
- dot_balls
- fours_conceded
- sixes_conceded
- wides
- noballs
- economy

### fall_of_wickets

- id
- innings_id
- wicket_number
- score_at_fall
- batter_out_name
- batter_out_player_id
- over_text

### did_not_bat

- id
- innings_id
- player_id
- player_name_raw

## 5. Parser Plan

Build the parser as small functions, not one large regex.

### 5.1 Extract Pages

Function:

- `extractPdfPages(file): Promise<string[]>`

Rules:

- use `pdfjs-dist`
- return raw text per page
- log page text during development
- if text is empty, throw a clear error

### 5.2 Parse Match Header

Function:

- `parseMatchDetails(pageOneText)`

Best-effort fields:

- league name
- teams
- ground
- date/time
- toss winner
- toss decision
- result text

Page 1 has interleaved columns, so cross-check final teams and totals from innings pages.

### 5.3 Parse Squad Page

Function:

- `parseSquads(pageTwoText)`

Input shape:

- two team names on one line
- numbered rows with one player from each team

Handle:

- captain marker `( C )`
- missing player on either side
- variable squad length

### 5.4 Parse Innings Page

Function:

- `parseInnings(pageText, inningsNumber)`

Zones:

- innings header
- batting rows
- extras
- total
- bowling rows
- to bat
- fall of wickets

Never trust the CricHeroes `(1st Innings)` label on page 4. Use page order.

### 5.5 Parse Batting Row

Function:

- `parseBattingRow(line)`

Rule:

- first token is order number
- last 6 tokens are `runs, balls, minutes, fours, sixes, strike_rate`
- middle contains player name, optional captain marker, optional batting style, and dismissal text

### 5.6 Parse Bowling Row

Function:

- `parseBowlingRow(line)`

Rule:

- first token is order number
- last 10 tokens are `overs, maidens, runs, wickets, dot_balls, fours, sixes, wides, noballs, economy`
- middle contains player name and optional captain marker

### 5.7 Parse Extras

Function:

- `parseExtras(line)`

Support:

- wides
- no-balls
- byes
- leg-byes
- missing breakdown

### 5.8 Parse Fall Of Wickets

Function:

- `parseFallOfWickets(lines)`

Rule:

- split on `),`
- parse score, wicket number, batter, and over
- keep over as text

### 5.9 Normalize Names

Function:

- `normalizePlayerName(rawName)`

Rules:

- trim whitespace
- remove `(c)`, `(C)`, `( C )`
- remove batting-style tags such as `(RHB)` and `(LHB)`
- collapse repeated spaces
- preserve normal display casing

Use the normalized name to find or create `players`.

### 5.10 Classify Dismissal

Function:

- `classifyDismissal(dismissalRaw)`

Types:

- `not_out`
- `bowled`
- `caught`
- `lbw`
- `run_out`
- `stumped`
- `retired_hurt`
- `retired_not_out`
- `hit_wicket`
- `other`

For batting average, count only completed dismissals. Treat `not_out`, `retired_hurt`, and `retired_not_out` as not dismissed.

## 6. Stats And Insights

### 6.1 Batting Insights

- highest score
- most runs
- best average with minimum innings filter
- best strike rate with minimum balls filter
- most sixes
- most fours
- most not-outs
- fastest innings by strike rate
- score progression by match

### 6.2 Bowling Insights

- most wickets
- best bowling figures
- best economy with minimum overs filter
- most dot balls
- most maidens
- most economical spell
- most wides/no-balls conceded

### 6.3 Team Insights

- team win/loss record
- average score batting first
- average score chasing
- successful chases
- defend wins
- toss winner match result
- extras conceded trend
- run rate trend

### 6.4 Match Insights

For each match, generate simple insights from structured data:

- player of the match candidate
- turning point from fall of wickets
- batting impact
- bowling impact
- extras impact

No LLM is needed for extraction. Optional summary text can be generated later from structured rows.

## 7. UI Theme

Audience: mostly age 35+.

Design principles:

- simple navigation
- large enough font sizes
- high contrast
- predictable table layouts
- minimal animation
- avoid tiny controls
- avoid decorative clutter
- use team colors carefully, not as the whole page palette

Suggested navigation:

- Dashboard
- Matches
- Players
- Teams
- Upload

Suggested visual style:

- white or very light background
- dark readable text
- clear section headings
- restrained green/cricket accent
- team logo accents
- tables with sticky headers where useful
- charts with clear legends and labels

## 8. Development Milestones

### Milestone 1: Project Setup

- create React + Vite + TypeScript app
- add routing
- add base layout and navigation
- add team logos
- add chart/table dependencies

Done when:

- app opens locally
- pages are routable
- logos display

### Milestone 2: Parser Foundation

- add PDF page extraction
- add parser functions
- add fixtures based on `samplepdf/Summary Scorecard 26291013.pdf`
- add unit tests for batting, bowling, extras, total, squads, and fall of wickets

Done when:

- sample PDF parses into structured JSON
- innings 1 exactly includes:
  - Shreyas S: 67 off 27, 3 fours, 8 sixes, SR 248.15, run out Gaurav, captain
  - Yogi: 25 off 16, not out, SR 156.25
  - extras: 5, with 4 wides and 1 no-ball
  - total: 97/1 in 7.0 overs, CRR 13.86
  - bowlers: Ramit Raj, Sughosh Rao, Gaurav, Mohit Momaya
  - fall of wicket: `97-1 (Shreyas S, 7 ov)`

### Milestone 3: Local Data Layer

- add schema
- add seed/import logic
- store uploaded match data
- support player creation and alias matching

Done when:

- imported match persists
- reloading the page keeps data
- repeated player names map to the same player

### Milestone 4: Scorecard Pages

- build match list
- build match detail page
- show full batting and bowling tables
- show extras, total, to-bat, fall of wickets

Done when:

- sample match is easy to read on desktop and mobile

### Milestone 5: Stats Pages

- build player leaderboards
- build team stats
- add filters for minimum innings, balls, and overs
- add charts

Done when:

- stats update from imported match data
- leaderboards are understandable without explanation text

### Milestone 6: Upload Flow

- build upload page
- parse PDF in browser
- show preview before save
- show parser warnings
- prevent duplicate import using PDF filename plus match date/team scores

Done when:

- user can upload a new CricHeroes PDF and confirm import

### Milestone 7: Production Setup

- move persistence to Supabase Postgres
- add environment variables
- deploy frontend to Vercel
- set up weekly keep-alive if Supabase free tier is used

Done when:

- public site is live
- imports work in production
- stats persist across devices

## 9. Testing Plan

Unit tests:

- name normalization
- dismissal classification
- batting row parser
- bowling row parser
- extras parser
- total parser
- squad parser
- fall-of-wickets parser
- innings parser

Integration tests:

- parse full sample PDF
- save parsed match
- calculate player stats
- calculate team stats

Manual checks:

- upload sample PDF
- compare scorecard UI against source PDF
- verify mobile layout
- verify chart labels are readable

## 10. Risks And Handling

PDF format changes:

- detect missing anchors
- show clear parser warning
- do not guess silently

Player name variations:

- normalize names
- store aliases
- later add a manual merge screen if needed

Players switching teams:

- do not attach player permanently to a team
- each performance row stores the team for that match only

Duplicate uploads:

- use source filename, date, teams, and scores to warn before saving

Cricket overs math:

- store overs as cricket notation text
- convert to balls only when calculating aggregate rates

## 11. First Build Steps

Start with:

1. Scaffold the React + Vite + TypeScript app.
2. Add the parser module and tests.
3. Extract text from `samplepdf/Summary Scorecard 26291013.pdf`.
4. Make the sample PDF a regression fixture.
5. Build the dashboard and match scorecard from parsed JSON.
6. Add persistence after the parser is verified.

The parser is the foundation. Do not build stats or deployment before the sample PDF parses exactly.
