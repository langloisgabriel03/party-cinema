# Party Cinema 🍿

Plan movie nights with friends: everyone adds films to a shared watchlist, then we use a calendar to
schedule a night and pick what we watch.

**Live:** https://tooning.co

> Current status: the skeleton. Netflix-style profile selection (shared across everyone via Supabase) →
> a placeholder dashboard. The watchlist and the calendar are not built yet.

## Stack

| | |
|---|---|
| Build | Vite 7 |
| UI | React 19 (plain JavaScript, no TypeScript) |
| Routing | React Router 7 (`createBrowserRouter`) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, no config file — theme tokens live in `src/index.css`) |
| State | Zustand 5 + `persist` (only `currentProfileId` is local; profiles live in Supabase) |
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
**Row Level Security** policies on the Supabase tables, not by keeping the key secret. Schema + policies:
see `supabase/schema.sql`.

Without these two vars set, the app still runs — the profile screen just shows
"Supabase is not configured yet." instead of crashing.

## How the pieces fit

```
src/
  App.jsx                       router + RequireProfile guard (waits out the loading state)
  lib/supabaseClient.js         Supabase client, degrades gracefully if env vars are missing
  store/useAppStore.js          the single app store — movies[] and nights[] go here next
  data/avatars.js               built-in avatar manifest (profiles store the id, not the URL)
  pages/ProfileSelect.jsx       "Who's watching?"
  pages/Dashboard.jsx           placeholder
  components/ProfileCard.jsx    profile tile + the dashed "add" tile
  components/AddProfileDialog.jsx   inserts into Supabase directly
supabase/schema.sql             profiles table + RLS policies + realtime, paste into SQL editor
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

Deploys run automatically on every push to `main`. Repo **Settings → Pages → Source** must be
**GitHub Actions**, and **Settings → Pages → Custom domain** must be `tooning.co` with DNS pointed at
GitHub (A/AAAA records at your DNS host) for the domain to actually resolve.

## Next up

- [ ] Movie search (TMDb) + shared watchlist
- [ ] Calendar to schedule a night and pick a film from the list
