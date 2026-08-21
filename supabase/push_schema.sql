-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Web push subscriptions. Unlike watchlist_items/nights, this table is NOT open to anon:
-- p256dh/auth are the per-device encryption secrets (RFC 8291) -- anyone holding them for an
-- endpoint can push arbitrary text to that lock screen. Same "server-only data" pattern as
-- deleted_rows -- RLS on, zero policies, so RLS default-denies every anon operation directly
-- on the table. Writes go through the two security definer functions below, each scoped to a
-- single endpoint the caller already possesses; reads happen only in the notify-night Edge
-- Function with the service_role key (which bypasses RLS entirely, not "matches a policy").

create table public.push_subscriptions (
  endpoint   text primary key,          -- the push endpoint IS the device identity
  p256dh     text not null,
  auth       text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'One row per browser/device, keyed by the push service endpoint (the same phone '
  're-subscribing gets the same endpoint back). p256dh + auth are RFC 8291 encryption '
  'secrets -- anon has no policy on this table at all, on purpose.';
comment on column public.push_subscriptions.profile_id is
  'not null on purpose: the whole point is excluding the person who booked the night, and a '
  'null profile can never be excluded correctly. Re-stamped by push_subscribe() on every app '
  'boot, so switching profile on a shared device follows the device.';

alter table public.push_subscriptions enable row level security;
-- Deliberately zero policies. Do NOT add a SELECT policy "for debugging" -- it hands every
-- visitor the keys to push arbitrary notifications to every one of these devices. And do not
-- add a plain anon INSERT/UPDATE/DELETE policy set either: Postgres requires SELECT rights to
-- evaluate a DELETE/UPDATE's WHERE clause, so without a SELECT policy every *scoped* write
-- (e.g. "unsubscribe this one endpoint") would silently affect 0 rows forever, while an
-- *unfiltered* DELETE reads nothing, matches no SELECT policy, and wipes the whole table --
-- one curl away, using the anon key that's already public in this repo's bundle.

-- ---------------------------------------------------------------------------
-- The only two things anon may do, each scoped to a single endpoint the caller already
-- holds. security definer runs as the owner, whose RLS is not enforced -- exactly like
-- record_deleted_row() in plan_schema.sql.
-- ---------------------------------------------------------------------------
create or replace function public.push_subscribe(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_profile  uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Cheap sanity gates. Not a security boundary (anon can always subscribe its own device --
  -- so can anyone who opens tooning.co), just junk-row prevention.
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'invalid endpoint';
  end if;
  if length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'invalid keys';
  end if;

  insert into public.push_subscriptions (endpoint, p256dh, auth, profile_id, updated_at)
  values (p_endpoint, p_p256dh, p_auth, p_profile, now())
  on conflict (endpoint) do update
    set p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        profile_id = excluded.profile_id,
        updated_at = now();
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; revoke and be explicit.
revoke all on function public.push_subscribe(text, text, text, uuid) from public;
revoke all on function public.push_unsubscribe(text) from public;
grant execute on function public.push_subscribe(text, text, text, uuid) to anon;
grant execute on function public.push_unsubscribe(text) to anon;

-- ---------------------------------------------------------------------------
-- Replay guard. Stops "POST {nightId} five hundred times" from re-notifying everyone.
-- ---------------------------------------------------------------------------
create table public.night_notifications (
  night_id uuid primary key references public.nights(id) on delete cascade,
  sent_at  timestamptz not null default now()
);

comment on table public.night_notifications is
  'A night announces itself exactly once, ever. notify-night claims a night by inserting '
  'here before sending; a second insert conflicts and the send is skipped. Kept in its own '
  'table rather than a nights.notified_at column because anon holds UPDATE on nights (using '
  'true) and could otherwise just null the flag out and replay.';

alter table public.night_notifications enable row level security;
-- Zero policies again: only service_role (the Edge Function / SQL editor) may touch it.

-- Not added to supabase_realtime, and no record_deleted_row trigger on either table: the undo
-- log exists to make *anon* deletes recoverable, and anon cannot delete from either table here.
