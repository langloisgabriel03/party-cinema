# Party Cinema 🍿

Plan movie nights with friends: everyone adds films to a shared watchlist, then we use a calendar to
schedule a night and pick what we watch.

**Live:** https://langloisgabriel03.github.io/party-cinema/

> Current status: the skeleton. Netflix-style profile selection → a placeholder dashboard.
> The watchlist and the calendar are not built yet.

## Stack

| | |
|---|---|
| Build | Vite 7 |
| UI | React 19 (plain JavaScript, no TypeScript) |
| Routing | React Router 7 (`createBrowserRouter`) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, no config file — theme tokens live in `src/index.css`) |
| State | Zustand 5 + `persist` |
| Hosting | GitHub Pages via GitHub Actions |

## Running it

Needs **Node 22** (see `.nvmrc`) — Vite 7 requires `^20.19 || >=22.12`.

```bash
nvm use 22      # Windows: run this in an Administrator terminal
npm install
npm run dev
```

Then open **http://localhost:5173/party-cinema/** — note the subpath. The bare root 404s, which is
expected: `base` is set to `/party-cinema/` so dev matches the deployed URL exactly.

```bash
npm run build     # → dist/
npm run preview   # serve the built output locally
```

## How the pieces fit

```
src/
  App.jsx                     router + RequireProfile guard
  store/useAppStore.js        the single app store — movies[] and nights[] go here next
  data/avatars.js             built-in avatar manifest (profiles store the id, not the URL)
  pages/ProfileSelect.jsx     "Who's watching?"
  pages/Dashboard.jsx         placeholder
  components/ProfileCard.jsx  profile tile + the dashed "add" tile
  components/AddProfileDialog.jsx
```

Two deploy details that are easy to break:

- **`base: '/party-cinema/'`** in `vite.config.js`, mirrored by `basename: import.meta.env.BASE_URL` in
  the router. Change one and you must change the other.
- **`404.html`** — GitHub Pages has no SPA rewrite rule, so a small plugin in `vite.config.js` copies
  `dist/index.html` to `dist/404.html` at build time. Without it, refreshing on `/party-cinema/dashboard`
  shows GitHub's 404 page.

Deploys run automatically on every push to `main`. Repo **Settings → Pages → Source** must be set to
**GitHub Actions**.

## ⚠️ Data is not actually shared yet

State is persisted to `localStorage`, so **each browser keeps its own copy** — you will not see your
friends' profiles or movies. That's fine for testing the shell, but a real shared watchlist needs a
backend, since GitHub Pages only serves static files.

Planned fix: **Supabase** free tier (Postgres + auth + realtime, works from a static site). Keys go in
GitHub Secrets and get injected as `VITE_*` env vars by the Actions build — never committed.

## Next up

- [ ] Movie search (TMDb) + shared watchlist
- [ ] Calendar to schedule a night and pick a film from the list
- [ ] Real backend so the data is genuinely shared
