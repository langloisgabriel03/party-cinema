-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Who's actually turning up to a movie night. Same trust model as the rest of the app: no auth,
-- so RLS is deliberately wide open (see the note at the bottom of plan_schema.sql).

create table public.night_rsvps (
  night_id   uuid        not null references public.nights(id)   on delete cascade,
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  going      boolean     not null,
  created_at timestamptz not null default now(),
  primary key (night_id, profile_id)
);

comment on table public.night_rsvps is
  'One row per (night, person). `going` is a boolean rather than a status enum because the third '
  'state -- hasn''t answered yet -- is the ABSENCE of a row, which keeps "who still needs to '
  'reply" a simple set difference instead of a magic value everyone has to remember to handle.';

comment on column public.night_rsvps.going is
  'true = coming, false = not coming. Changing your mind is an UPDATE of this column, not a '
  'second row, which is why it sits outside the primary key (unlike watchlist_items, where the '
  'pair itself IS the vote).';

alter table public.night_rsvps enable row level security;

create policy "RSVPs are viewable by everyone"
  on public.night_rsvps for select to anon using (true);
create policy "Anyone can RSVP"
  on public.night_rsvps for insert to anon with check (true);
create policy "Anyone can change an RSVP"
  on public.night_rsvps for update to anon using (true) with check (true);
-- `using` gates which rows may be targeted, `with check` gates the row that results. Spelled out
-- rather than relying on Postgres falling back to `using` for the second.
create policy "Anyone can withdraw an RSVP"
  on public.night_rsvps for delete to anon using (true);

alter publication supabase_realtime add table public.night_rsvps;

-- Reuses the record_deleted_row() trigger function from plan_schema.sql.
create trigger night_rsvps_deleted after delete on public.night_rsvps
  for each row execute function public.record_deleted_row();
