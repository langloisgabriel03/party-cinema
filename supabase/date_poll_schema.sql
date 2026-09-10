-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- "When can everyone do this one?" -- the other half of scheduling. Picking a date yourself is
-- already covered by nights + night_movies; this is for the film nobody can find a slot for,
-- where the question is which evenings actually work for people before a night exists at all.
--
-- Same trust model as the rest of the app: no auth, so RLS is deliberately wide open (see the
-- note at the bottom of plan_schema.sql).

-- One open poll per film. movie_id IS the primary key rather than a surrogate id: "is there a
-- poll for this film?" is the only lookup the client ever does, a second poll for the same film
-- would be meaningless, and it keeps poll_availability's foreign key a plain bigint.
create table public.date_polls (
  movie_id   bigint      not null primary key references public.movies(id) on delete cascade,
  created_by uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.date_polls is
  'A film someone has asked the group to find a date for. Deleted once the night is booked from '
  'the poll (or dropped by hand) -- this table only ever holds OPEN questions, so the dashboard '
  'can render it directly without filtering by state.';

comment on column public.date_polls.created_by is
  'on delete set null, not cascade: deleting a profile must not silently withdraw a question the '
  'rest of the group is still answering.';

-- One row per (film, person, day) -- a vote-shaped join exactly like watchlist_items. "Can''t
-- make it" is the ABSENCE of a row, so there is no third state to handle anywhere.
-- The movie_id FK points at date_polls, not movies, and cascades: closing a poll must take its
-- answers with it, or re-opening one for the same film later would resurrect everyone's
-- months-old availability as if it were freshly given.
create table public.poll_availability (
  movie_id     bigint      not null references public.date_polls(movie_id) on delete cascade,
  profile_id   uuid        not null references public.profiles(id)         on delete cascade,
  available_on date        not null,
  created_at   timestamptz not null default now(),
  primary key (movie_id, profile_id, available_on)
);

comment on table public.poll_availability is
  'Who can do which day. No surrogate id, same reasoning as watchlist_items and roulette_entries: '
  'under default replica identity a realtime DELETE payload carries exactly the PK columns, which '
  'here is the whole row -- the tuple the client indexes under and targets deletes with.';

comment on column public.poll_availability.available_on is
  'A DATE, not a timestamp: movie nights are day-granular everywhere in this app (see nights.'
  'scheduled_for and the big comment in src/data/dates.js about never letting one near a UTC '
  'parse).';

alter table public.date_polls  enable row level security;
alter table public.poll_availability enable row level security;

create policy "Date polls are viewable by everyone"
  on public.date_polls for select to anon using (true);
create policy "Anyone can open a date poll"
  on public.date_polls for insert to anon with check (true);
create policy "Anyone can close a date poll"
  on public.date_polls for delete to anon using (true);
-- No UPDATE policy: nothing about an open poll is editable -- you close it and open another.

create policy "Availability is viewable by everyone"
  on public.poll_availability for select to anon using (true);
create policy "Anyone can mark themselves available"
  on public.poll_availability for insert to anon with check (true);
create policy "Anyone can take back their availability"
  on public.poll_availability for delete to anon using (true);
-- No UPDATE policy: every column is part of the PK, same as watchlist_items.

alter publication supabase_realtime add table public.date_polls;
alter publication supabase_realtime add table public.poll_availability;

-- Reuses the record_deleted_row() trigger function already created by plan_schema.sql.
create trigger date_polls_deleted after delete on public.date_polls
  for each row execute function public.record_deleted_row();
create trigger poll_availability_deleted after delete on public.poll_availability
  for each row execute function public.record_deleted_row();
