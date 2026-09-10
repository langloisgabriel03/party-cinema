-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- Two admin powers over the catalog, both gated client-side only by isAdmin() (src/data/avatars.js)
-- -- same trust model as the rest of this app (no auth at all, see plan_schema.sql's note at the
-- bottom): RLS stays wide open to anon, and "admin" just means the UI offers the button.
--
--   1. Deleting a bad catalog entry from the /movies page.
--   2. Adding one by hand (paste a Rotten Tomatoes link, see supabase/functions/fetch-rt-movie.ts).
--
-- movies_schema.sql deliberately shipped with anon SELECT only -- "every write comes from
-- sync_to_supabase.py's service_role key". This adds the two anon write policies that trust model
-- was missing, now that the app itself needs to write here too.

create policy "Anyone can add a movie"
  on public.movies for insert to anon with check (true);
create policy "Anyone can delete a movie"
  on public.movies for delete to anon using (true);
-- Still no anon UPDATE: nothing in the app edits an existing row's fields (a rescrape/refresh
-- stays sync_to_supabase.py's job, service_role only) -- delete-and-re-add is the correction path.

-- ---------------------------------------------------------------------------
-- Undo log for an accidental delete -- reuses plan_schema.sql's existing mechanism verbatim.
-- ---------------------------------------------------------------------------
create trigger movies_deleted after delete on public.movies
  for each row execute function public.record_deleted_row();

-- Restore the most recent deletion(s) after a mistake -- run from the SQL editor. `id` is
-- deliberately excluded (movies.id is `generated always as identity`; inserting an explicit
-- value into one needs `overriding system value`, and a fresh id is fine here regardless -- no
-- FK anywhere stores a movie id across a delete, they all cascade or null out with the row):
--
--   insert into public.movies
--     (slug, title, year, decade, genres, director, "cast", runtime_minutes, poster, synopsis,
--      countries, letterboxd_url, lists, franchise, tomatometer, audience_score,
--      critic_review_count, audience_rating_count, rt_url, rt_last_refreshed, data_sources, synced_at)
--   select m.slug, m.title, m.year, m.decade, m.genres, m.director, m."cast", m.runtime_minutes,
--          m.poster, m.synopsis, m.countries, m.letterboxd_url, m.lists, m.franchise, m.tomatometer,
--          m.audience_score, m.critic_review_count, m.audience_rating_count, m.rt_url,
--          m.rt_last_refreshed, m.data_sources, m.synced_at
--   from public.deleted_rows dr,
--        lateral (select * from jsonb_populate_record(null::public.movies, dr.row_data)) m
--   where dr.table_name = 'movies' and dr.deleted_at > now() - interval '1 hour'
--   on conflict (slug) do nothing;
--
-- Then also clear its tombstone below, or sync_to_supabase.py will treat the restored row as
-- still-deleted and quietly stop refreshing its scores forever without ever deleting it again:
--   delete from public.deleted_movies where slug = '...';

-- ---------------------------------------------------------------------------
-- Permanent-deletion tombstone -- the piece the undo log above can't provide.
-- ---------------------------------------------------------------------------
-- deleted_rows (above) is a generic, multi-table "oops, undo my mistake" log for a human to
-- restore from by hand. It does nothing to stop sync_to_supabase.py's next run from silently
-- re-inserting a deliberately-deleted movie: the local SQLite row that produced it is untouched,
-- so an ordinary upsert-by-slug brings it right back (as a new id) the next time anyone runs the
-- sync. This table is what sync_to_supabase.py is updated to actually consult -- keyed by slug,
-- since that's the only handle the sync script has (it never sees Supabase's generated ids).
create table public.deleted_movies (
  slug       text        primary key,
  title      text,
  deleted_at timestamptz not null default now()
);

comment on table public.deleted_movies is
  'Slugs an admin has intentionally removed from the catalog. sync_to_supabase.py skips any of '
  'these when upserting, so a deleted movie stays deleted across the next scrape/refresh run -- '
  'without this, the local SQLite pipeline (unaware anything happened in Supabase) recreates the '
  'row from scratch on its next sync. `title` is here only so the row is legible to a human '
  'reading this table, never consulted by the sync -- slug is the whole key.';

alter table public.deleted_movies enable row level security;

create policy "Deleted-movie tombstones are viewable by everyone"
  on public.deleted_movies for select to anon using (true);
create policy "Anyone can tombstone a slug"
  on public.deleted_movies for insert to anon with check (true);
create policy "Anyone can clear a tombstone"
  on public.deleted_movies for delete to anon using (true);
