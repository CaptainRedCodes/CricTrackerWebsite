create table if not exists public.matches (
  id text primary key,
  fingerprint text not null unique,
  match_date date,
  team_a text not null,
  team_b text not null,
  winner_team text,
  result_text text,
  source_pdf_filename text,
  match_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists matches_match_date_idx on public.matches (match_date desc);
create index if not exists matches_team_a_idx on public.matches (team_a);
create index if not exists matches_team_b_idx on public.matches (team_b);
create index if not exists matches_winner_team_idx on public.matches (winner_team);

alter table public.matches enable row level security;

drop policy if exists "public read matches" on public.matches;
create policy "public read matches"
on public.matches for select
using (true);

drop policy if exists "public insert matches" on public.matches;
create policy "public insert matches"
on public.matches for insert
with check (true);

-- Public inserts are convenient for this private local tournament link.
-- If you need admin-only uploads later, add Supabase Auth and tighten this policy.
