create extension if not exists "pgcrypto";

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  avatar_url text,
  total_points integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  kickoff_time timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'finished')),
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, match_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists predictions_set_updated_at on public.predictions;
create trigger predictions_set_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

create or replace view public.leaderboard as
select
  p.id,
  p.name,
  p.avatar_url,
  coalesce(sum(pr.points), 0)::integer as total_points
from public.players p
left join public.predictions pr on pr.player_id = p.id
group by p.id, p.name, p.avatar_url
order by total_points desc, p.name asc;

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "Anyone can read players" on public.players;
create policy "Anyone can read players"
on public.players for select
using (true);

drop policy if exists "Anyone can create players" on public.players;
create policy "Anyone can create players"
on public.players for insert
with check (true);

drop policy if exists "Anyone can read matches" on public.matches;
create policy "Anyone can read matches"
on public.matches for select
using (true);

drop policy if exists "Anyone can manage matches for MVP" on public.matches;
create policy "Anyone can manage matches for MVP"
on public.matches for all
using (true)
with check (true);

drop policy if exists "Anyone can read predictions" on public.predictions;
create policy "Anyone can read predictions"
on public.predictions for select
using (true);

drop policy if exists "Anyone can create predictions" on public.predictions;
create policy "Anyone can create predictions"
on public.predictions for insert
with check (true);

drop policy if exists "Anyone can update predictions" on public.predictions;
create policy "Anyone can update predictions"
on public.predictions for update
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Anyone can upload avatars" on storage.objects;
create policy "Anyone can upload avatars"
on storage.objects for insert
with check (bucket_id = 'avatars');
