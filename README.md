# Party Cinema 🍿

Plan movie nights with friends: everyone browses a 5,851-movie catalog and adds what they want to watch,
then a calendar schedules a night and (optionally) picks a film from the list.

**Live:** https://tooning.co

## Stack

| | |
|---|---|
| Build | Vite 7 |
| UI | React 19 (plain JavaScript, no TypeScript) |
| Routing | React Router 7 (`createBrowserRouter`) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, no config file — theme tokens live in `src/index.css`) |
| Search | MiniSearch (client-side, over the whole catalog fetched once — see `src/store/useMovieCatalogStore.js`) |
| State | Zustand 5 (only `useAppStore`'s `currentProfileId` is `persist`ed to localStorage; everything shared lives in Supabase) |
| Backend | Supabase (Postgres + realtime), free tier |
| Hosting | GitHub Pages via GitHub Actions, custom domain |

## Running it

Needs **Node 22** (see `.nvmrc`) — Vite 7 requires `^20.19 || >=22.12`.

```bash
nvm use 22      # Windows: run this in an Administrator terminal
npm install
cp .env.example .env   # fill in the two Supabase values, see below
npm run dev
```

Then open **http://localhost:5173/**.

```bash
npm run build     # → dist/
npm run preview   # serve the built output locally
```

### Environment variables

From the Supabase dashboard → **Settings → API**:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Put these in a local `.env` (gitignored) for `npm run dev`/`npm run build`. In CI they come from repo
**Settings → Secrets and variables → Actions**, secrets named exactly `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, referenced in `.github/workflows/deploy.yml`.

The anon key is meant to be public (it ships in the JS bundle) — access control is enforced by
**Row Level Security** policies on the Supabase tables, not by keeping the key secret. `watchlist_items`
and `nights` are open to anon INSERT/DELETE (and UPDATE for `nights`) since there's no auth system —
profiles are a trust-based Netflix-style chooser, not accounts. A `deleted_rows` trigger (see
`supabase/plan_schema.sql`) is the mitigation: it logs every delete server-side where the anon key can't
read or erase it, so a wipe is recoverable with one SQL statement instead of being permanent.

Without these two vars set, the app still runs — pages show "Supabase is not configured yet." instead of
crashing.

## How the pieces fit

```
src/
  App.jsx                          router + RequireProfile guard (waits out the loading state)
  lib/
    supabaseClient.js              Supabase client, degrades gracefully if env vars are missing
    movies.js                      fetchAllMovies() -- paginates past PostgREST's 1000-row cap
  store/
    useAppStore.js                 profiles (shared) + currentProfileId (local, the only persisted field)
    useMovieCatalogStore.js        the 5,851-row catalog + MiniSearch index + moviesById/ensureMovies
                                    (targeted backfill for the dashboard, without fetching the whole catalog)
    usePlanStore.js                shared watchlist_items + nights, realtime, optimistic writes
  data/
    avatars.js                     built-in + personal photo avatars (profiles store the id, not the URL)
    filterSchema.json              genre taxonomy + list labels, copied from the rt-dashboard scraper project
    movieCatalog.js                pure helpers: filtering, sorting, weighted score, year-aware search parser
    plan.js                        pure helpers: grouping the watchlist by movie, sorting/filtering nights
    dates.js                       date-only helpers -- see the big comment there about UTC boundary bugs
  pages/
    ProfileSelect.jsx              "Who's watching?"
    Dashboard.jsx                  next night, calendar, upcoming nights, watchlist
    Movies.jsx                     search/filter/browse the catalog, add to watchlist
  components/
    AppHeader.jsx, ProfileCard.jsx, AddProfileDialog.jsx
    MovieCard.jsx, MovieFilterDialog.jsx, WatchlistButton.jsx
    MonthCalendar.jsx, NightDialog.jsx, WatchlistCard.jsx, UpcomingNights.jsx
supabase/
  schema.sql            profiles
  movies_schema.sql      read-only movie catalog, synced from a separate Python scraper (rt-dashboard)
  plan_schema.sql        watchlist_items + nights, RLS, realtime, the deleted_rows undo trigger
  plan_schema_v2.sql     migration: night_movies join table (a night can hold >1 film), drops
                          nights.movie_id/start_time -- nights are day-only, apply after plan_schema.sql
```

Deploy details that are easy to break:

- **`base: '/'`** in `vite.config.js`, mirrored by `basename: import.meta.env.BASE_URL` in the router.
  Root-based because the custom domain serves from `/`, not a `/party-cinema/` subpath. Change one and
  you must change the other.
- **`public/CNAME`** (contains `tooning.co`) — Pages deployed via Actions doesn't auto-manage this file
  the way the legacy branch-based deploy did; it has to ship inside the build artifact every time, so it
  lives in `public/` like any other static asset.
- **`404.html`** — GitHub Pages has no SPA rewrite rule, so a small plugin in `vite.config.js` copies
  `dist/index.html` to `dist/404.html` at build time. Without it, refreshing on `/dashboard` shows
  GitHub's 404 page.
- **`src/data/dates.js`** — every date the calendar touches must go through `toISODate`/`fromISODate`.
  `new Date('2026-08-25')` parses as UTC midnight, which renders as the wrong day in a negative-offset
  timezone; this file exists specifically to keep that bug out.
- **`public/sw.js` must stay cache-free.** GitHub Pages replaces all of `dist/` on every deploy, so a
  precached `index.html` would pin hashed asset URLs that no longer exist — a white screen until
  manual site-data clear. If a caching layer (Workbox, `vite-plugin-pwa`) is ever added here, that's the
  failure mode to design around first. Registered with `updateViaCache: 'none'` for the same reason in
  reverse: Pages serves `sw.js` with `max-age=600`, and without that flag a fixed worker could take up
  to ten minutes to reach anyone, served stale from the HTTP cache.
- **`notify-night`'s `verify_jwt` relies on the anon key being a legacy JWT.** `functions.invoke()` sends
  it as a bearer token today because it *is* one (`eyJ...`). Supabase is retiring legacy JWT keys in
  favor of `sb_publishable_…`/`sb_secret_…` — the day this project's anon key rotates, supabase-js stops
  sending it as `Authorization`, and Edge Functions 401 **before the handler runs**, so notifications
  would just stop with nothing in the function logs. If notifications silently die after a key rotation,
  this is why.

Deploys run automatically on every push to `main`. Repo **Settings → Pages → Source** must be
**GitHub Actions**, and **Settings → Pages → Custom domain** must be `tooning.co` with DNS pointed at
GitHub (A/AAAA records at your DNS host) for the domain to actually resolve.

## The movie catalog

`movies_schema.sql` is a **read-only mirror** — the app can SELECT but never write to it. The real source
of truth is a separate Python scraper project (`rt-dashboard`), which pushes updates via
`sync_to_supabase.py` using the Supabase service_role key (never shipped to the browser). Run that script
after a re-scrape to pick up new titles or refreshed Rotten Tomatoes scores.

On `/movies`, the whole catalog is fetched once client-side and searched/filtered entirely in the
browser — see `useMovieCatalogStore.js` for why (no per-keystroke network round-trip, matches the source
scraper's own architecture at this data size). Movies with fewer than
`MIN_AUDIENCE_RATING_COUNT` (50) audience ratings are permanently excluded everywhere, not just behind a
togglable filter — see the comment in `movieCatalog.js`.

## Next up

- [ ] TMDb-style richer movie detail (synopsis expansion, trailer link) — currently just card-level info
- [ ] A dedicated watchlist page (Dashboard currently caps the preview and expands inline)
