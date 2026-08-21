-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Who is actually playing a given bracket. Before this, every match waited on a vote from every
-- profile that exists, so one person being away stalled the whole tournament.

create table public.bracket_participants (
  bracket_id uuid not null references public.brackets(id)  on delete cascade,
  profile_id uuid not null references public.profiles(id)  on delete cascade,
  primary key (bracket_id, profile_id)
);

comment on table public.bracket_participants is
  'The voters for one bracket. A match is decided against THIS count, not the number of profiles '
  'in the app. Same composite-PK reasoning as the other join tables: under default replica '
  'identity a realtime DELETE payload carries exactly the PK columns.';

alter table public.bracket_participants enable row level security;
create policy "Participants are viewable by everyone"
  on public.bracket_participants for select to anon using (true);
create policy "Anyone can add a participant"
  on public.bracket_participants for insert to anon with check (true);
create policy "Anyone can remove a participant"
  on public.bracket_participants for delete to anon using (true);
-- No UPDATE policy: both columns are the PK, so there is nothing to update.

alter publication supabase_realtime add table public.bracket_participants;

-- Reuses the record_deleted_row() trigger function from plan_schema.sql.
create trigger bracket_participants_deleted after delete on public.bracket_participants
  for each row execute function public.record_deleted_row();

-- Backfill: any bracket already running predates this table and was played by everyone, so give
-- it every profile as a participant. Without this an in-flight bracket would suddenly have zero
-- voters and could never resolve another match.
insert into public.bracket_participants (bracket_id, profile_id)
select b.id, p.id from public.brackets b cross join public.profiles p
on conflict do nothing;
