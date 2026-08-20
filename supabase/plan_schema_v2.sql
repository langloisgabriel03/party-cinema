-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Migration on top of plan_schema.sql (already applied to production): a night can now have
-- multiple films attached instead of one, and nights are day-only (no time-of-day field).

-- ---------------------------------------------------------------------------
-- night_movies: one row per (night, film) -- same shape as watchlist_items. Lets a night have
-- more than one attached film (deciding between options, a double feature, etc).
-- ---------------------------------------------------------------------------
create table public.night_movies (
  night_id   uuid        not null references public.nights(id)  on delete cascade,
  movie_id   bigint      not null references public.movies(id)  on delete cascade,
  added_by   uuid        references public.profiles(id)         on delete set null,
  created_at timestamptz not null default now(),
  primary key (night_id, movie_id)
);

comment on table public.night_movies is
  'Film(s) attached to a scheduled night -- replaces nights.movie_id (a night can now carry more '
  'than one). Same composite-PK reasoning as watchlist_items: under default replica identity a '
  'realtime DELETE payload carries only the PK columns, which is exactly (night_id, movie_id) --'
  'the tuple the client indexes rows under and targets removals with.';

-- Carry forward anything already attached under the old single-movie_id model before dropping it.
insert into public.night_movies (night_id, movie_id)
select id, movie_id from public.nights where movie_id is not null
on conflict do nothing;

alter table public.nights drop column movie_id;
alter table public.nights drop column start_time;
-- Nights are day-only in the UI now. Dropped rather than left unused so the schema doesn't lie
-- about what the app actually collects. (No unique constraint on scheduled_for was ever added --
-- see plan_schema.sql's comment on why one-night-per-date is a UI convention, not a DB rule: it
-- avoids turning a simultaneous tap into a 409 nobody can arbitrate.)

alter table public.night_movies enable row level security;
create policy "Night movies are viewable by everyone"
  on public.night_movies for select to anon using (true);
create policy "Anyone can attach a film to a night"
  on public.night_movies for insert to anon with check (true);
create policy "Anyone can remove a film from a night"
  on public.night_movies for delete to anon using (true);
-- No UPDATE policy: both real columns are the PK, same reasoning as watchlist_items.

alter publication supabase_realtime add table public.night_movies;

-- Reuses the record_deleted_row() trigger function already created by plan_schema.sql.
create trigger night_movies_deleted after delete on public.night_movies
  for each row execute function public.record_deleted_row();
