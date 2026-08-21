-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Knockout Bracket: a single-elimination tournament seeded from the shared watchlist. Same trust
-- model as the rest of this app (no auth, RLS deliberately wide open -- see plan_schema.sql).

-- ---------------------------------------------------------------------------
-- brackets: one tournament. Only one is "active" at a time by convention (the UI shows the most
-- recent), but nothing here enforces that -- a stale bracket is harmless history.
-- ---------------------------------------------------------------------------
create table public.brackets (
  id                uuid primary key default gen_random_uuid(),
  status            text not null default 'active',
  champion_movie_id bigint references public.movies(id) on delete set null,
  created_by        uuid   references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint brackets_status_check check (status in ('active', 'complete'))
);

-- ---------------------------------------------------------------------------
-- bracket_matches: every slot in the tree, created up-front (including empty future rounds) so
-- advancing a winner is an UPDATE of an existing row rather than an INSERT that races.
-- ---------------------------------------------------------------------------
create table public.bracket_matches (
  id         uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  round      int  not null,
  slot       int  not null,
  movie_a    bigint references public.movies(id) on delete set null,
  movie_b    bigint references public.movies(id) on delete set null,
  winner     bigint references public.movies(id) on delete set null,
  unique (bracket_id, round, slot)
);

comment on column public.bracket_matches.round is
  '1-indexed. Round 1 is the opening round; the final is the highest round, which always has '
  'exactly one slot. Later rounds start with null movie_a/movie_b and get filled in as earlier '
  'matches resolve.';

create index bracket_matches_bracket_idx on public.bracket_matches (bracket_id);

-- ---------------------------------------------------------------------------
-- bracket_votes: one vote per person per match. Changing your mind is an UPDATE of movie_id, not
-- a second row -- hence movie_id sits outside the primary key (unlike watchlist_items, where the
-- pair IS the vote).
-- ---------------------------------------------------------------------------
create table public.bracket_votes (
  match_id   uuid        not null references public.bracket_matches(id) on delete cascade,
  profile_id uuid        not null references public.profiles(id)        on delete cascade,
  movie_id   bigint      not null references public.movies(id)          on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Policies: anyone can do anything, same reasoning as plan_schema.sql.
-- ---------------------------------------------------------------------------
alter table public.brackets enable row level security;
create policy "Brackets are viewable by everyone"  on public.brackets for select to anon using (true);
create policy "Anyone can start a bracket"         on public.brackets for insert to anon with check (true);
create policy "Anyone can update a bracket"        on public.brackets for update to anon using (true) with check (true);
create policy "Anyone can delete a bracket"        on public.brackets for delete to anon using (true);

alter table public.bracket_matches enable row level security;
create policy "Matches are viewable by everyone"   on public.bracket_matches for select to anon using (true);
create policy "Anyone can create matches"          on public.bracket_matches for insert to anon with check (true);
create policy "Anyone can resolve a match"         on public.bracket_matches for update to anon using (true) with check (true);
create policy "Anyone can delete matches"          on public.bracket_matches for delete to anon using (true);

alter table public.bracket_votes enable row level security;
create policy "Votes are viewable by everyone"     on public.bracket_votes for select to anon using (true);
create policy "Anyone can vote"                    on public.bracket_votes for insert to anon with check (true);
create policy "Anyone can change their vote"       on public.bracket_votes for update to anon using (true) with check (true);
create policy "Anyone can retract a vote"          on public.bracket_votes for delete to anon using (true);

-- ---------------------------------------------------------------------------
-- Realtime. Votes and match resolutions both need to land live on everyone's screen.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.brackets;
alter publication supabase_realtime add table public.bracket_matches;
alter publication supabase_realtime add table public.bracket_votes;

-- Reuses the record_deleted_row() trigger function already created by plan_schema.sql.
create trigger brackets_deleted        after delete on public.brackets        for each row execute function public.record_deleted_row();
create trigger bracket_matches_deleted after delete on public.bracket_matches for each row execute function public.record_deleted_row();
create trigger bracket_votes_deleted   after delete on public.bracket_votes   for each row execute function public.record_deleted_row();
