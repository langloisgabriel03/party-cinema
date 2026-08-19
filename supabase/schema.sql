-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Shared profiles for the "Who's watching?" screen. No auth yet, so access is controlled by
-- RLS policies (open read/insert, no update/delete) rather than by who's logged in.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  to anon
  using (true);

create policy "Anyone can add a profile"
  on public.profiles for insert
  to anon
  with check (true);

-- Lets the app see other people's new profiles live, without a page refresh.
alter publication supabase_realtime add table public.profiles;
