-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Read-only reference catalog of movies, ported from a local SQLite scraping pipeline
-- (rt-dashboard, see C:\Users\gabri\rt-dashboard). Populated and kept in sync ONLY by
-- sync_to_supabase.py, run locally with the service_role key (bypasses RLS) -- the app itself
-- only ever reads this table with the anon key. See rt-dashboard/CLAUDE.md for the source of
-- truth data pipeline (scraping, score refresh, dedupe).

create table public.movies (
  id                     bigint generated always as identity primary key,
  slug                   text not null unique,
  title                  text not null,
  year                   integer not null,
  decade                 integer not null,
  genres                 text[] not null default '{}',
  director               text[] not null default '{}',
  "cast"                 text[] not null default '{}',
  runtime_minutes        integer,
  poster                 text,
  synopsis               text,
  countries              text[] not null default '{}',
  letterboxd_url         text,
  lists                  text[] not null default '{}',
  franchise              text,
  tomatometer            integer check (tomatometer between 0 and 100),
  audience_score         integer check (audience_score between 0 and 100),
  critic_review_count    integer check (critic_review_count >= 0),
  audience_rating_count  integer check (audience_rating_count >= 0),
  rt_url                 text,
  rt_last_refreshed      timestamptz not null,
  data_sources           text[] not null default '{}',
  synced_at              timestamptz not null default now()
);

comment on table public.movies is
  'Read-only movie catalog mirrored from rt-dashboard''s local SQLite DB by sync_to_supabase.py. '
  'App code must never write to this table -- RLS only grants anon SELECT.';
comment on column public.movies.synced_at is
  'Set explicitly by sync_to_supabase.py on every upsert (INSERT and UPDATE) -- staleness '
  'indicator for the mirror itself, distinct from rt_last_refreshed (per-movie RT score refresh time).';

alter table public.movies enable row level security;

create policy "Movies are viewable by everyone"
  on public.movies for select
  to anon
  using (true);

-- Deliberately no insert/update/delete policy for anon: RLS default-denies any operation with
-- no matching policy. All writes come from sync_to_supabase.py using the service_role key,
-- which bypasses RLS entirely (not "a policy that allows it" -- RLS just doesn't apply to it).

-- Not added to supabase_realtime (unlike profiles): this is a curated catalog updated by an
-- occasional manual script run, not something open tabs need pushed live updates for.

-- Indexes: added once the table crossed into the tens of thousands of rows (an RT-sitemap-wide
-- catalog scrape, filtered to movies with critic or audience review count > 25, or on a curated
-- list -- see sync_to_supabase.py's MIN_REVIEW_COUNT/clears_quality_bar -- pushed it from ~5,851
-- to well past that). Below that, a sequential scan was faster than the network round-trip to
-- Supabase's edge, so an index would have bought nothing; past it, the app's genre/list/year/
-- tomatometer filters and title search benefit.
-- Safe to run standalone against the already-existing table (paste into SQL Editor -> Run):
create index if not exists movies_genres_gin      on public.movies using gin (genres);
create index if not exists movies_lists_gin       on public.movies using gin (lists);
create index if not exists movies_year_idx        on public.movies (year);
create index if not exists movies_tomatometer_idx on public.movies (tomatometer);
create extension if not exists pg_trgm;
create index if not exists movies_title_trgm      on public.movies using gin (title gin_trgm_ops);
