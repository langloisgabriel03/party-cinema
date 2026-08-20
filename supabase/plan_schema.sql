-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Shared watchlist + scheduled movie nights. Same trust model as profiles: no auth, so RLS is
-- the only gate and it's deliberately wide open. See the blast-radius note at the bottom.

-- ---------------------------------------------------------------------------
-- watchlist_items: one row per (film, person) -- a vote, not a list entry.
-- ---------------------------------------------------------------------------
create table public.watchlist_items (
  movie_id   bigint      not null references public.movies(id)   on delete cascade,
  added_by   uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (movie_id, added_by)
);

comment on table public.watchlist_items is
  'The pair IS the key: one vote per person per film, so tapping "+" twice is a DELETE, not a '
  'second row. Deliberately no surrogate id -- under default replica identity a realtime DELETE '
  'payload carries only the PK columns, and (movie_id, added_by) is exactly the tuple the client '
  'indexes rows under and targets deletes with.';

-- No index beyond the PK: at a few dozen rows a sequential scan beats the round-trip, same
-- reasoning as movies_schema.sql. If it ever matters:
--   create index watchlist_items_added_by_idx on public.watchlist_items (added_by);

-- ---------------------------------------------------------------------------
-- nights: the film is optional -- book the date first, attach a film later or day-of.
-- ---------------------------------------------------------------------------
create table public.nights (
  id            uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  start_time    time,
  movie_id      bigint references public.movies(id)   on delete set null,
  note          text,
  created_by    uuid   references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on column public.nights.scheduled_for is
  'date, not timestamptz: a movie night is "Aug 25", not an instant. timestamptz would make the '
  'night land on a different day for a friend in another timezone, and force a UTC-vs-local '
  'decision on every render.';
comment on column public.nights.movie_id is
  'FK to movies, NOT to watchlist_items: the watchlist is only the *picker source*. Removing a '
  'film from the watchlist must not silently un-pick it from a scheduled night.';

-- No unique constraint on scheduled_for: with three people and realtime, a one-night-per-date
-- rule turns a simultaneous tap into a 409 nobody can arbitrate. Multiple nights on a date are
-- legal; the calendar dot means ">= 1 night" and the dialog lists them.

-- ---------------------------------------------------------------------------
-- Policies. Anyone can do anything, honestly: profiles aren't authenticated, so "only the person
-- who added it may remove it" would be UI politeness dressed up as security.
-- ---------------------------------------------------------------------------
alter table public.watchlist_items enable row level security;

create policy "Watchlist is viewable by everyone"
  on public.watchlist_items for select to anon using (true);
create policy "Anyone can add to the watchlist"
  on public.watchlist_items for insert to anon with check (true);
create policy "Anyone can remove from the watchlist"
  on public.watchlist_items for delete to anon using (true);
-- No UPDATE policy: both real columns are the primary key, so there is nothing to update.
-- RLS default-denies anything with no matching policy -- the omission IS the enforcement.

alter table public.nights enable row level security;

create policy "Nights are viewable by everyone"
  on public.nights for select to anon using (true);
create policy "Anyone can schedule a night"
  on public.nights for insert to anon with check (true);
create policy "Anyone can edit a night"
  on public.nights for update to anon using (true) with check (true);
-- `using` gates which rows may be targeted; `with check` gates the row that results. Postgres
-- falls back to `using` when `with check` is omitted -- spelled out so it isn't inferred.
create policy "Anyone can cancel a night"
  on public.nights for delete to anon using (true);

-- ---------------------------------------------------------------------------
-- Realtime. Both tables need INSERT + DELETE (+ UPDATE for nights).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.watchlist_items;
alter publication supabase_realtime add table public.nights;

-- Replica identity is left at DEFAULT (= the primary key) on purpose. That means a DELETE
-- payload's `old` record carries ONLY the PK columns, and an UPDATE payload's `old` likewise --
-- which is all the client needs: it removes rows by PK and replaces updated rows wholesale from
-- `new`. `replica identity full` would double WAL volume on every write to buy three things we
-- don't use: previous values on UPDATE, server-side realtime filters on non-PK columns, and RLS
-- evaluation on DELETE events (moot -- our SELECT policy is `using (true)`).

-- ---------------------------------------------------------------------------
-- Undo log. This is the entire mitigation for open anon DELETE.
-- ---------------------------------------------------------------------------
create table public.deleted_rows (
  id         bigint generated always as identity primary key,
  table_name text  not null,
  row_data   jsonb not null,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_rows enable row level security;
-- Deliberately zero policies: RLS default-denies every operation, so the anon key can neither
-- read this table nor erase its own tracks. Only service_role (SQL editor) can touch it.

create or replace function public.record_deleted_row()
returns trigger
language plpgsql
security definer   -- runs as the owner, whose RLS is not enforced -- an invoker-rights trigger
                   -- would be blocked by deleted_rows' (intentional) lack of an anon policy
set search_path = public, pg_temp
as $$
begin
  insert into public.deleted_rows (table_name, row_data) values (tg_table_name, to_jsonb(old));
  return old;
end;
$$;

create trigger watchlist_items_deleted after delete on public.watchlist_items
  for each row execute function public.record_deleted_row();
create trigger nights_deleted after delete on public.nights
  for each row execute function public.record_deleted_row();

-- Restore after an accidental (or malicious) wipe -- run from the SQL editor:
--   insert into public.watchlist_items
--   select (jsonb_populate_record(null::public.watchlist_items, row_data)).*
--   from public.deleted_rows
--   where table_name = 'watchlist_items' and deleted_at > now() - interval '1 hour'
--   on conflict do nothing;
