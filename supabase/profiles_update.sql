-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
-- Lets a profile's picture be changed from the app. profiles was created (schema.sql) with only
-- SELECT and INSERT policies, so an UPDATE matched no policy, affected zero rows, and returned
-- no error -- the change would appear to save and silently vanish on the next load.

create policy "Anyone can edit a profile"
  on public.profiles for update to anon using (true) with check (true);
-- `using` gates which rows may be targeted, `with check` gates the row that results. Spelled out
-- rather than relying on Postgres falling back to `using` for the latter.
--
-- Wide open on purpose, same as every other table here: profiles aren't authenticated, so
-- "only Marie may edit Marie" would be UI politeness dressed up as security (see the note at the
-- bottom of plan_schema.sql). The pictures are a fixed set shipped in the repo, so the worst case
-- is a friend setting someone else's photo to another of that person's photos.

-- profiles is already in the supabase_realtime publication (schema.sql) -- UPDATE events flow
-- over the existing subscription with no extra grant needed.

-- No deleted_rows trigger: this is an UPDATE, and record_deleted_row() only fires on DELETE.
