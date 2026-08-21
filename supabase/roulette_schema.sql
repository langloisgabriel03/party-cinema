-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Roulette: a shared pool for the "spin to pick" game. Same shape and trust model as
-- watchlist_items (plan_schema.sql) -- one row per (film, person), anyone can add or remove.

create table public.roulette_entries (
  movie_id   bigint      not null references public.movies(id)   on delete cascade,
  added_by   uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (movie_id, added_by)
);

comment on table public.roulette_entries is
  'Entries in the movie-roulette pool. Same PK reasoning as watchlist_items: no surrogate id, so a '
  'realtime DELETE payload carries exactly (movie_id, added_by) under default replica identity -- '
  'the tuple the client indexes rows under and targets deletes with. The "up to 2 per person" cap '
  'is enforced client-side only, same trust model as the rest of this app (see plan_schema.sql''s '
  'policy comment) -- nothing here stops a determined caller from adding a third.';

alter table public.roulette_entries enable row level security;

create policy "Roulette pool is viewable by everyone"
  on public.roulette_entries for select to anon using (true);
create policy "Anyone can add to the roulette pool"
  on public.roulette_entries for insert to anon with check (true);
create policy "Anyone can remove from the roulette pool"
  on public.roulette_entries for delete to anon using (true);
-- No UPDATE policy: both real columns are the PK, same reasoning as watchlist_items.

alter publication supabase_realtime add table public.roulette_entries;

-- Reuses the record_deleted_row() trigger function already created by plan_schema.sql.
create trigger roulette_entries_deleted after delete on public.roulette_entries
  for each row execute function public.record_deleted_row();
