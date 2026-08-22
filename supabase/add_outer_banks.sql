-- Paste into the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- Manual catalog addition. The `movies` table has no anon INSERT policy on purpose (see
-- movies_schema.sql) -- every write goes through the service_role key, which is what the SQL
-- editor runs as, so this has to be pasted rather than done from the app.
--
-- Note this is a TV SERIES, not a film, in a catalog that is otherwise films. That's fine for
-- picking something to watch together, but two fields can't be filled honestly:
--   * runtime_minutes is null -- an episode is ~50 min and the whole run is far longer, and
--     neither is "the runtime". A null means it drops out if anyone drags the runtime slider.
--   * lists is empty -- it belongs to none of the studio/4K lists the catalog is built from,
--     so it won't appear under any List filter chip. Search and sort still find it.
--
-- Scores are the real Rotten Tomatoes numbers as of Aug 2026 (not hardcoded guesses):
-- https://www.rottentomatoes.com/tv/outer_banks -- 79% critics / 61% audience, 42 reviews.
--
-- `id` is `generated always as identity`, so it is deliberately not supplied here.

insert into public.movies (
  slug, title, year, decade, genres, director, "cast", runtime_minutes, poster, synopsis,
  countries, lists, franchise, tomatometer, audience_score, critic_review_count,
  audience_rating_count, rt_url, data_sources
) values (
  'rt_outer_banks',
  'Outer Banks',
  2020,
  2020,
  array['Drama','Adventure','Mystery'],
  array[]::text[],
  array['Chase Stokes','Madelyn Cline','Madison Bailey'],
  null,
  'https://resizing.flixster.com/-/400x600/v2/https://resizing.flixster.com/q_wE5VV71WQq54TTdAe2DlHvTaQ=/ems.cHJkLWVtcy1hc3NldHMvdHZzZWFzb24vY2YzMWI1Y2YtNGIyZS00NThlLTg0NTUtZGUyNjhlMWIxOGJhLmpwZw==',
  'A group of teenagers on the Outer Banks of North Carolina hunt for a legendary treasure tied to one of their missing fathers.',
  array['USA'],
  array[]::text[],
  null,
  79,
  61,
  42,
  2500,
  'https://www.rottentomatoes.com/tv/outer_banks',
  array['rottentomatoes']
)
-- Safe to run twice: slug is unique, so a re-run updates the scores rather than adding a copy.
on conflict (slug) do update set
  tomatometer           = excluded.tomatometer,
  audience_score        = excluded.audience_score,
  critic_review_count   = excluded.critic_review_count,
  audience_rating_count = excluded.audience_rating_count,
  poster                = excluded.poster;
