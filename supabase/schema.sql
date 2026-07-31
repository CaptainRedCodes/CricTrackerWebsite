-- ── players ──
create table if not exists public.players (
  id text primary key,
  canonical_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;

create policy "public read players" on public.players for select using (true);
create policy "public insert players" on public.players for insert with check (true);
create policy "public upsert players" on public.players for update using (true) with check (true);

-- ── matches ──
create table if not exists public.matches (
  id text primary key,
  fingerprint text not null unique,
  league_name text not null default '',
  match_date date,
  match_time text,
  ground text,
  team_a text not null,
  team_b text not null,
  toss_winner text,
  toss_decision text,
  result_text text not null default '',
  winner_team text,
  win_margin_text text,
  source_pdf_filename text,
  created_at timestamptz not null default now()
);

create index if not exists matches_match_date_idx on public.matches (match_date desc);
create index if not exists matches_team_a_idx on public.matches (team_a);
create index if not exists matches_team_b_idx on public.matches (team_b);
create index if not exists matches_winner_team_idx on public.matches (winner_team);

alter table public.matches enable row level security;

create policy "public read matches" on public.matches for select using (true);
create policy "public insert matches" on public.matches for insert with check (true);

-- ── squad_players ──
create table if not exists public.squad_players (
  match_id text not null references public.matches(id) on delete cascade,
  team text not null,
  player_id text not null,
  player_name_raw text not null,
  is_captain boolean not null default false,
  primary key (match_id, player_id)
);

create index if not exists squad_players_match_idx on public.squad_players (match_id);
create index if not exists squad_players_player_idx on public.squad_players (player_id);

alter table public.squad_players enable row level security;

create policy "public read squad_players" on public.squad_players for select using (true);
create policy "public insert squad_players" on public.squad_players for insert with check (true);

-- ── innings ──
create table if not exists public.innings (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  innings_number integer not null,
  batting_team text not null,
  bowling_team text not null,
  total_runs integer not null default 0,
  total_wickets integer not null default 0,
  overs text not null default '0.0',
  crr numeric not null default 0,
  extras_total integer not null default 0,
  extras_wide integer not null default 0,
  extras_noball integer not null default 0,
  extras_bye integer not null default 0,
  extras_legbye integer not null default 0
);

create index if not exists innings_match_idx on public.innings (match_id);

alter table public.innings enable row level security;

create policy "public read innings" on public.innings for select using (true);
create policy "public insert innings" on public.innings for insert with check (true);

-- ── batting_performances ──
create table if not exists public.batting_performances (
  id text primary key,
  innings_id text not null references public.innings(id) on delete cascade,
  order_no integer not null,
  player_id text not null,
  player_name_raw text not null,
  team text not null,
  is_captain boolean not null default false,
  batting_style text,
  dismissal_raw text not null default '',
  dismissal_type text not null default 'other',
  runs integer not null default 0,
  balls integer not null default 0,
  minutes integer not null default 0,
  fours integer not null default 0,
  sixes integer not null default 0,
  strike_rate numeric not null default 0
);

create index if not exists batting_perf_innings_idx on public.batting_performances (innings_id);
create index if not exists batting_perf_player_idx on public.batting_performances (player_id);

alter table public.batting_performances enable row level security;

create policy "public read batting_performances" on public.batting_performances for select using (true);
create policy "public insert batting_performances" on public.batting_performances for insert with check (true);

-- ── bowling_performances ──
create table if not exists public.bowling_performances (
  id text primary key,
  innings_id text not null references public.innings(id) on delete cascade,
  order_no integer not null,
  player_id text not null,
  player_name_raw text not null,
  team text not null,
  is_captain boolean not null default false,
  overs text not null default '0.0',
  maidens integer not null default 0,
  runs_conceded integer not null default 0,
  wickets integer not null default 0,
  dot_balls integer not null default 0,
  fours_conceded integer not null default 0,
  sixes_conceded integer not null default 0,
  wides integer not null default 0,
  noballs integer not null default 0,
  economy numeric not null default 0
);

create index if not exists bowling_perf_innings_idx on public.bowling_performances (innings_id);
create index if not exists bowling_perf_player_idx on public.bowling_performances (player_id);

alter table public.bowling_performances enable row level security;

create policy "public read bowling_performances" on public.bowling_performances for select using (true);
create policy "public insert bowling_performances" on public.bowling_performances for insert with check (true);

-- ── fall_of_wickets ──
create table if not exists public.fall_of_wickets (
  id serial primary key,
  innings_id text not null references public.innings(id) on delete cascade,
  wicket_number integer not null,
  score_at_fall integer not null,
  batter_out text not null default '',
  "over" text not null default ''
);

create index if not exists fow_innings_idx on public.fall_of_wickets (innings_id);

alter table public.fall_of_wickets enable row level security;

create policy "public read fall_of_wickets" on public.fall_of_wickets for select using (true);
create policy "public insert fall_of_wickets" on public.fall_of_wickets for insert with check (true);

-- ── did_not_bat ──
create table if not exists public.did_not_bat (
  id serial primary key,
  innings_id text not null references public.innings(id) on delete cascade,
  player_name text not null default ''
);

create index if not exists dnb_innings_idx on public.did_not_bat (innings_id);

alter table public.did_not_bat enable row level security;

create policy "public read did_not_bat" on public.did_not_bat for select using (true);
create policy "public insert did_not_bat" on public.did_not_bat for insert with check (true);

-- ── RPC: save a full match atomically ──
create or replace function public.save_normalized_match(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inn record;
begin
  insert into public.players (id, canonical_name, aliases)
  select distinct on (sp->>'playerId')
    sp->>'playerId',
    sp->>'playerNameRaw',
    jsonb_build_array(sp->>'playerNameRaw')
  from jsonb_array_elements(payload->'squads') as sp
  where sp->>'playerId' is not null
  on conflict (id) do nothing;

  with incoming as (
    select distinct sp->>'playerId' as pid, sp->>'playerNameRaw' as alias
    from jsonb_array_elements(payload->'squads') as sp
    where sp->>'playerId' is not null
  )
  update public.players
  set aliases = public.players.aliases || jsonb_build_array(incoming.alias)
  from incoming
  where public.players.id = incoming.pid
    and not public.players.aliases @> jsonb_build_array(incoming.alias);

  insert into public.matches (
    id, fingerprint, league_name, match_date, match_time, ground,
    team_a, team_b, toss_winner, toss_decision, result_text,
    winner_team, win_margin_text, source_pdf_filename, created_at
  ) values (
    payload->>'id',
    payload->>'fingerprint',
    coalesce(payload->>'leagueName', ''),
    nullif(payload->>'matchDate', '')::date,
    nullif(payload->>'matchTime', ''),
    nullif(payload->>'ground', ''),
    payload->>'teamA',
    payload->>'teamB',
    nullif(payload->>'tossWinner', ''),
    nullif(payload->>'tossDecision', ''),
    coalesce(payload->>'resultText', ''),
    nullif(payload->>'winnerTeam', ''),
    nullif(payload->>'winMarginText', ''),
    nullif(payload->>'sourcePdfFilename', ''),
    coalesce((payload->>'createdAt')::timestamptz, now())
  );

  insert into public.squad_players (match_id, team, player_id, player_name_raw, is_captain)
  select
    payload->>'id',
    sp->>'team',
    sp->>'playerId',
    sp->>'playerNameRaw',
    coalesce((sp->>'isCaptain')::boolean, false)
  from jsonb_array_elements(payload->'squads') as sp;

  for inn in select * from jsonb_array_elements(payload->'innings')
  loop
    insert into public.innings (
      id, match_id, innings_number, batting_team, bowling_team,
      total_runs, total_wickets, overs, crr,
      extras_total, extras_wide, extras_noball, extras_bye, extras_legbye
    ) values (
      inn->>'id',  payload->>'id',
      (inn->>'inningsNumber')::int, inn->>'battingTeam', inn->>'bowlingTeam',
      (inn->>'totalRuns')::int, (inn->>'totalWickets')::int,
      inn->>'overs', (inn->>'crr')::numeric,
      (inn->>'extrasTotal')::int, (inn->>'extrasWide')::int,
      (inn->>'extrasNoball')::int, (inn->>'extrasBye')::int,
      (inn->>'extrasLegbye')::int
    );

    insert into public.batting_performances (
      id, innings_id, order_no, player_id, player_name_raw,
      team, is_captain, batting_style, dismissal_raw, dismissal_type,
      runs, balls, minutes, fours, sixes, strike_rate
    )
    select
      b->>'id', inn->>'id', (b->>'orderNo')::int,
      b->>'playerId', b->>'playerNameRaw', b->>'team',
      coalesce((b->>'isCaptain')::boolean, false),
      nullif(b->>'battingStyle', ''),
      coalesce(b->>'dismissalRaw', ''),
      coalesce(b->>'dismissalType', 'other'),
      (b->>'runs')::int, (b->>'balls')::int, (b->>'minutes')::int,
      (b->>'fours')::int, (b->>'sixes')::int, (b->>'strikeRate')::numeric
    from jsonb_array_elements(inn->'batting') as b;

    insert into public.bowling_performances (
      id, innings_id, order_no, player_id, player_name_raw,
      team, is_captain, overs, maidens, runs_conceded, wickets,
      dot_balls, fours_conceded, sixes_conceded, wides, noballs, economy
    )
    select
      b->>'id', inn->>'id', (b->>'orderNo')::int,
      b->>'playerId', b->>'playerNameRaw', b->>'team',
      coalesce((b->>'isCaptain')::boolean, false),
      b->>'overs', (b->>'maidens')::int, (b->>'runsConceded')::int, (b->>'wickets')::int,
      (b->>'dotBalls')::int, (b->>'foursConceded')::int, (b->>'sixesConceded')::int,
      (b->>'wides')::int, (b->>'noballs')::int, (b->>'economy')::numeric
    from jsonb_array_elements(inn->'bowling') as b;

    insert into public.fall_of_wickets (innings_id, wicket_number, score_at_fall, batter_out, "over")
    select
      inn->>'id', (f->>'wicketNumber')::int, (f->>'scoreAtFall')::int,
      coalesce(f->>'batterOut', ''), coalesce(f->>'over', '')
    from jsonb_array_elements(inn->'fallOfWickets') as f;

    insert into public.did_not_bat (innings_id, player_name)
    select inn->>'id', p
    from jsonb_array_elements_text(inn->'didNotBat') as p;
  end loop;
end;
$$;

-- ── RPC: load all matches as assembled JSON ──
create or replace function public.load_normalized_matches()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(match_obj order by (match_obj->>'matchDate') desc nulls last, (match_obj->>'createdAt') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', m.id,
      'fingerprint', m.fingerprint,
      'leagueName', m.league_name,
      'matchDate', m.match_date,
      'matchTime', m.match_time,
      'ground', m.ground,
      'teamA', m.team_a,
      'teamB', m.team_b,
      'tossWinner', m.toss_winner,
      'tossDecision', m.toss_decision,
      'resultText', m.result_text,
      'winnerTeam', m.winner_team,
      'winMarginText', m.win_margin_text,
      'sourcePdfFilename', m.source_pdf_filename,
      'createdAt', m.created_at,
      'squads', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'team', sq.team,
          'playerNameRaw', sq.player_name_raw,
          'playerId', sq.player_id,
          'isCaptain', sq.is_captain
        )), '[]'::jsonb)
        from public.squad_players sq where sq.match_id = m.id
      ),
      'innings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id,
          'inningsNumber', i.innings_number,
          'battingTeam', i.batting_team,
          'bowlingTeam', i.bowling_team,
          'totalRuns', i.total_runs,
          'totalWickets', i.total_wickets,
          'overs', i.overs,
          'crr', i.crr,
          'extrasTotal', i.extras_total,
          'extrasWide', i.extras_wide,
          'extrasNoball', i.extras_noball,
          'extrasBye', i.extras_bye,
          'extrasLegbye', i.extras_legbye,
          'batting', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', bp.id,
              'inningsId', bp.innings_id,
              'orderNo', bp.order_no,
              'playerNameRaw', bp.player_name_raw,
              'playerId', bp.player_id,
              'team', bp.team,
              'isCaptain', bp.is_captain,
              'battingStyle', bp.batting_style,
              'dismissalRaw', bp.dismissal_raw,
              'dismissalType', bp.dismissal_type,
              'runs', bp.runs,
              'balls', bp.balls,
              'minutes', bp.minutes,
              'fours', bp.fours,
              'sixes', bp.sixes,
              'strikeRate', bp.strike_rate
            ) order by bp.order_no), '[]'::jsonb)
            from public.batting_performances bp where bp.innings_id = i.id
          ),
          'bowling', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', bop.id,
              'inningsId', bop.innings_id,
              'orderNo', bop.order_no,
              'playerNameRaw', bop.player_name_raw,
              'playerId', bop.player_id,
              'team', bop.team,
              'isCaptain', bop.is_captain,
              'overs', bop.overs,
              'maidens', bop.maidens,
              'runsConceded', bop.runs_conceded,
              'wickets', bop.wickets,
              'dotBalls', bop.dot_balls,
              'foursConceded', bop.fours_conceded,
              'sixesConceded', bop.sixes_conceded,
              'wides', bop.wides,
              'noballs', bop.noballs,
              'economy', bop.economy
            ) order by bop.order_no), '[]'::jsonb)
            from public.bowling_performances bop where bop.innings_id = i.id
          ),
          'fallOfWickets', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'wicketNumber', f.wicket_number,
              'scoreAtFall', f.score_at_fall,
              'batterOut', f.batter_out,
              'over', f."over"
            ) order by f.wicket_number), '[]'::jsonb)
            from public.fall_of_wickets f where f.innings_id = i.id
          ),
          'didNotBat', (
            select coalesce(jsonb_agg(dnb.player_name order by dnb.player_name), '[]'::jsonb)
            from public.did_not_bat dnb where dnb.innings_id = i.id
          )
        ) order by i.innings_number), '[]'::jsonb)
        from public.innings i where i.match_id = m.id
      )
    ) as match_obj
    from public.matches m
  ) sub;
$$;
