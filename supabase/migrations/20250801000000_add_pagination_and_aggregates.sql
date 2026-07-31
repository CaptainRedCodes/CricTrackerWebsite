-- ── Migration: add paginated loading + server-side aggregate RPCs ──

-- RPC 1: paginated match list (lightweight — match headers + innings summaries only)
create or replace function public.get_match_page(p_page int default 1, p_page_size int default 20)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*)::int from public.matches),
    'page', p_page,
    'pageSize', p_page_size,
    'matches', coalesce(jsonb_agg(match_obj order by (match_obj->>'matchDate') desc nulls last, (match_obj->>'createdAt') desc), '[]'::jsonb)
  )
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
          'extrasLegbye', i.extras_legbye
        ) order by i.innings_number), '[]'::jsonb)
        from public.innings i where i.match_id = m.id
      )
    ) as match_obj
    from public.matches m
    order by m.match_date desc nulls last, m.created_at desc
    limit p_page_size offset ((p_page - 1) * p_page_size)
  ) sub;
$$;

-- RPC 2: load a single full match (with all nested details — same shape as original load_normalized_matches)
create or replace function public.get_match_detail(p_match_id text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(match_obj), '[]'::jsonb) -> 0
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
    where m.id = p_match_id
  ) sub;
$$;

-- ── RPC 3: aggregate batting stats (server-side) ──
create or replace function public.get_batting_aggregates()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'playerId', agg.pid,
      'name', agg.player_name,
      'innings', agg.inns,
      'runs', agg.runs,
      'balls', agg.balls,
      'dismissals', agg.dismissals,
      'fours', agg.fours,
      'sixes', agg.sixes,
      'highScore', agg.high_score,
      'notOuts', agg.not_outs
    )
    order by agg.runs desc
  ), '[]'::jsonb)
  from (
    select
      bp.player_id as pid,
      max(bp.player_name_raw) as player_name,
      count(*)::int as inns,
      coalesce(sum(bp.runs), 0)::int as runs,
      coalesce(sum(bp.balls), 0)::int as balls,
      count(*) filter (where bp.dismissal_type not in ('not_out','retired_hurt','retired_not_out'))::int as dismissals,
      coalesce(sum(bp.fours), 0)::int as fours,
      coalesce(sum(bp.sixes), 0)::int as sixes,
      coalesce(max(bp.runs), 0)::int as high_score,
      count(*) filter (where bp.dismissal_type in ('not_out','retired_hurt','retired_not_out'))::int as not_outs
    from public.batting_performances bp
    group by bp.player_id
  ) agg;
$$;

-- ── RPC 4: aggregate bowling stats (server-side) ──
create or replace function public.get_bowling_aggregates()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'playerId', agg.pid,
      'name', agg.player_name,
      'innings', agg.inns,
      'balls', agg.balls,
      'runsConceded', agg.runs_conceded,
      'wickets', agg.wickets,
      'maidens', agg.maidens,
      'dotBalls', agg.dot_balls,
      'wides', agg.wides,
      'noballs', agg.noballs,
      'bestWickets', agg.best_w,
      'bestRuns', agg.best_r
    )
    order by agg.wickets desc, agg.economy asc
  ), '[]'::jsonb)
  from (
    select
      bop.player_id as pid,
      max(bop.player_name_raw) as player_name,
      count(*)::int as inns,
      coalesce(sum(bop.dot_balls), 0)::int as dot_balls,
      coalesce(sum(bop.wickets), 0)::int as wickets,
      coalesce(sum(bop.maidens), 0)::int as maidens,
      coalesce(sum(bop.runs_conceded), 0)::int as runs_conceded,
      coalesce(sum(bop.wides), 0)::int as wides,
      coalesce(sum(bop.noballs), 0)::int as noballs,
      -- approximate balls from overs (overs stored as text like "4.0", "3.3")
      coalesce(
        sum((split_part(bop.overs, '.', 1)::int * 6) + coalesce(split_part(bop.overs, '.', 2)::int, 0))
      , 0)::int as balls,
      coalesce(max(bop.wickets), 0)::int as best_w,
      coalesce(min(bop.runs_conceded) filter (where bop.wickets = (select max(sub.wickets) from public.bowling_performances sub where sub.player_id = bop.player_id)), 0)::int as best_r,
      case when sum(
        (split_part(bop.overs, '.', 1)::int * 6) + coalesce(split_part(bop.overs, '.', 2)::int, 0)
      ) > 0 then
        round((
          coalesce(sum(bop.runs_conceded), 0)::numeric * 6 /
          greatest(sum((split_part(bop.overs, '.', 1)::int * 6) + coalesce(split_part(bop.overs, '.', 2)::int, 0)), 1)
        )::numeric, 2)
      else null end as economy
    from public.bowling_performances bop
    group by bop.player_id
  ) agg;
$$;

-- ── RPC 5: aggregate fielding stats (server-side) ──
-- Parses dismissal_raw text: "c Bowler b Fielder" / "run out Fielder" / "st Keeper b Bowler"
create or replace function public.get_fielding_aggregates()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with catches as (
    select
      trim(regexp_replace(
        regexp_replace(bp.dismissal_raw, '^c\s+\S+\s+b\s+', '', 'i'),
        '\s*$', ''
      )) as fielder_name
    from public.batting_performances bp
    where bp.dismissal_raw ~* '^c\s+\S+\s+b\s+'
  ),
  run_outs as (
    select
      trim(regexp_replace(bp.dismissal_raw, '^run\s+out\s+', '', 'i')) as fielder_name
    from public.batting_performances bp
    where bp.dismissal_raw ~* '^run\s+out\s+'
  ),
  stumpings as (
    select
      trim(regexp_replace(
        regexp_replace(bp.dismissal_raw, '^st\s+\S+\s+b\s+', '', 'i'),
        '\s*$', ''
      )) as fielder_name
    from public.batting_performances bp
    where bp.dismissal_raw ~* '^st\s+\S+\s+b\s+'
  ),
  combined as (
    select fielder_name as name, 'catch' as kind from catches
    union all
    select fielder_name, 'run_out' from run_outs
    union all
    select fielder_name, 'stumping' from stumpings
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'playerId', lower(regexp_replace(c.name, '\s+', '', 'g')),
      'name', c.name,
      'catches', c.catches,
      'runOuts', c.run_outs,
      'stumpings', c.stumpings,
      'total', c.catches + c.run_outs + c.stumpings
    )
    order by (c.catches + c.run_outs + c.stumpings) desc, c.catches desc
  ), '[]'::jsonb)
  from (
    select
      name,
      count(*) filter (where kind = 'catch')::int as catches,
      count(*) filter (where kind = 'run_out')::int as run_outs,
      count(*) filter (where kind = 'stumping')::int as stumpings
    from combined
    where name is not null and name != ''
    group by name
  ) c;
$$;

-- ── RPC 6: aggregate team stats (server-side) ──
create or replace function public.get_team_aggregates()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'teamStats', coalesce((
      select jsonb_agg(ts order by ts->>'team')
      from (
        select jsonb_build_object(
          'team', t.team,
          'matches', t.matches,
          'wins', t.wins,
          'losses', t.matches - t.wins,
          'runs', t.runs,
          'wicketsLost', t.wkts_lost,
          'balls', t.balls,
          'highest', t.highest,
          'lowest', t.lowest,
          'extras', t.extras
        ) as ts
        from (
          select
            i.batting_team as team,
            count(distinct i.match_id)::int as matches,
            count(distinct i.match_id) filter (where m.winner_team = i.batting_team)::int as wins,
            coalesce(sum(i.total_runs), 0)::int as runs,
            coalesce(sum(i.total_wickets), 0)::int as wkts_lost,
            coalesce(sum(
              (split_part(i.overs, '.', 1)::int * 6) + coalesce(split_part(i.overs, '.', 2)::int, 0)
            ), 0)::int as balls,
            coalesce(max(i.total_runs), 0)::int as highest,
            coalesce(min(i.total_runs), 0)::int as lowest,
            coalesce(sum(i.extras_total), 0)::int as extras
          from public.innings i
          join public.matches m on m.id = i.match_id
          group by i.batting_team
        ) t
      )
    ), '[]'::jsonb),
    'runRates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', mr.name,
        'team1', mr.team1,
        'rr1', mr.rr1,
        'team2', mr.team2,
        'rr2', mr.rr2
      ) order by mr.sort_order)
      from (
        select
          coalesce(m.match_date::text, 'Match ' || row_number() over (order by m.match_date asc nulls last)) as name,
          row_number() over (order by m.match_date asc nulls last) as sort_order,
          (select i.batting_team from public.innings i where i.match_id = m.id and i.innings_number = 1) as team1,
          (select
            case when ob.overs_balls > 0 then round((i1.total_runs * 6.0 / ob.overs_balls)::numeric, 2) else 0 end
            from public.innings i1,
            lateral (select (split_part(i1.overs, '.', 1)::int * 6) + coalesce(split_part(i1.overs, '.', 2)::int, 0) as overs_balls) ob
            where i1.match_id = m.id and i1.innings_number = 1
            limit 1
          ) as rr1,
          (select i.batting_team from public.innings i where i.match_id = m.id and i.innings_number = 2) as team2,
          (select
            case when ob2.overs_balls > 0 then round((i2.total_runs * 6.0 / ob2.overs_balls)::numeric, 2) else 0 end
            from public.innings i2,
            lateral (select (split_part(i2.overs, '.', 1)::int * 6) + coalesce(split_part(i2.overs, '.', 2)::int, 0) as overs_balls) ob2
            where i2.match_id = m.id and i2.innings_number = 2
            limit 1
          ) as rr2
        from public.matches m
      ) mr
    ), '[]'::jsonb),
    'composition', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team', comp.team,
        'fours', comp.four_runs,
        'sixes', comp.six_runs,
        'rotation', comp.rotation
      ) order by comp.team)
      from (
        select
          bp.team,
          coalesce(sum(bp.fours) * 4, 0)::int as four_runs,
          coalesce(sum(bp.sixes) * 6, 0)::int as six_runs,
          greatest(coalesce(sum(bp.runs), 0) - coalesce(sum(bp.fours) * 4, 0) - coalesce(sum(bp.sixes) * 6, 0), 0)::int as rotation
        from public.batting_performances bp
        group by bp.team
      ) comp
    ), '[]'::jsonb),
    'forAgainst', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team', fa.team,
        'scored', fa.scored,
        'conceded', fa.conceded
      ) order by fa.team)
      from (
        select
          bat.team,
          bat.scored,
          coalesce(bowl.conceded, 0) as conceded
        from (
          select i.batting_team as team, coalesce(sum(i.total_runs), 0)::int as scored
          from public.innings i group by i.batting_team
        ) bat
        left join (
          select i.bowling_team as team, coalesce(sum(i.total_runs), 0)::int as conceded
          from public.innings i group by i.bowling_team
        ) bowl on bat.team = bowl.team
      ) fa
    ), '[]'::jsonb),
    'matchTrends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', md.label,
        'team1', md.bat1,
        'score1', md.s1,
        'wickets1', md.w1,
        'team2', md.bat2,
        'score2', md.s2,
        'wickets2', md.w2,
        'total', md.total,
        'extras', coalesce(md.extras, 0)
      ) order by md.sort_order)
      from (
        select
          coalesce(m.match_date::text, 'Match ' || row_number() over (order by m.match_date asc nulls last)) as label,
          row_number() over (order by m.match_date asc nulls last) as sort_order,
          (select i.batting_team from public.innings i where i.match_id = m.id and i.innings_number = 1) as bat1,
          (select i.total_runs from public.innings i where i.match_id = m.id and i.innings_number = 1) as s1,
          (select i.total_wickets from public.innings i where i.match_id = m.id and i.innings_number = 1) as w1,
          (select i.batting_team from public.innings i where i.match_id = m.id and i.innings_number = 2) as bat2,
          (select i.total_runs from public.innings i where i.match_id = m.id and i.innings_number = 2) as s2,
          (select i.total_wickets from public.innings i where i.match_id = m.id and i.innings_number = 2) as w2,
          coalesce(
            (select sum(i.total_runs) from public.innings i where i.match_id = m.id), 0
          )::int as total,
          coalesce(
            (select sum(i.extras_total) from public.innings i where i.match_id = m.id), 0
          )::int as extras
        from public.matches m
      ) md
    ), '[]'::jsonb),
    'latestMatch', (
      select jsonb_build_object(
        'id', m.id,
        'teamA', m.team_a,
        'teamB', m.team_b,
        'matchDate', m.match_date,
        'resultText', m.result_text,
        'innings', coalesce((
          select jsonb_agg(jsonb_build_object(
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
            'extrasLegbye', i.extras_legbye
          ) order by i.innings_number)
          from public.innings i where i.match_id = m.id
        ), '[]'::jsonb)
      )
      from public.matches m
      order by m.match_date desc nulls last, m.created_at desc
      limit 1
    )
  );
$$;

-- ── RPC 7: aggregate venue stats (server-side) ──
create or replace function public.get_venue_aggregates()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with venue_matches as (
    select
      coalesce(nullif(m.ground, ''), 'Unknown venue') as venue,
      m.id as match_id,
      m.match_date,
      m.winner_team,
      (select i.total_runs from public.innings i where i.match_id = m.id and i.innings_number = 1) as s1,
      (select i.total_runs from public.innings i where i.match_id = m.id and i.innings_number = 2) as s2,
      (select i.total_wickets from public.innings i where i.match_id = m.id and i.innings_number = 1) as w1,
      (select i.total_wickets from public.innings i where i.match_id = m.id and i.innings_number = 2) as w2
    from public.matches m
  ),
  venue_base as (
    select
      venue,
      count(*)::int as matches,
      round((sum(s1 + s2) / count(*)::numeric), 1) as avg_runs,
      max(greatest(s1, s2))::int as highest,
      min(least(s1, s2))::int as lowest,
      round((sum(w1 + w2) / count(*)::numeric), 1) as avg_wickets,
      max(match_date::text) as last_match
    from venue_matches
    group by venue
  ),
  venue_best_bowler as (
    select distinct on (vm.venue)
      vm.venue,
      bp.player_name_raw as bowler_name,
      bp.wickets as bowler_wickets
    from venue_matches vm
    join public.innings inn on inn.match_id = vm.match_id
    join public.bowling_performances bp on bp.innings_id = inn.id
    order by vm.venue, bp.wickets desc, bp.runs_conceded asc
  ),
  venue_top_wins as (
    select distinct on (vm.venue)
      vm.venue,
      vm.winner_team as top_team,
      count(*) over (partition by vm.venue, vm.winner_team) as win_count
    from venue_matches vm
    where vm.winner_team is not null
    order by vm.venue, count(*) over (partition by vm.venue, vm.winner_team) desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ground', vb.venue,
      'matches', vb.matches,
      'avgRuns', vb.avg_runs,
      'highest', vb.highest,
      'lowest', vb.lowest,
      'avgWickets', vb.avg_wickets,
      'lastMatch', vb.last_match,
      'bestBowler', coalesce(vbb.bowler_name, '-'),
      'bestFigures', coalesce(vbb.bowler_wickets, 0),
      'topWinsTeam', coalesce(vtw.top_team, '-'),
      'topWinsCount', coalesce(vtw.win_count, 0)
    )
    order by vb.matches desc
  ), '[]'::jsonb)
  from venue_base vb
  left join venue_best_bowler vbb on vbb.venue = vb.venue
  left join venue_top_wins vtw on vtw.venue = vb.venue;
$$;
