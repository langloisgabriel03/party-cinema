-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Replay guard for the notify-bracket Edge Function, one row per (bracket, round).
--
-- Needed because every open client resolves a match at the same moment the deciding vote lands,
-- and each one calls notify-bracket. The function claims the round by inserting here first; the
-- losers of that race get a conflict and send nothing, so a round produces one wave of pushes
-- rather than one per person watching.

create table public.bracket_notifications (
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  round      int  not null,
  sent_at    timestamptz not null default now(),
  primary key (bracket_id, round)
);

alter table public.bracket_notifications enable row level security;
-- Deliberately zero policies, exactly like night_notifications: RLS default-denies everything, so
-- the anon key can neither read this table nor clear a claim to replay a round. Only the Edge
-- Function reaches it, and it uses the service role, which RLS does not apply to.
