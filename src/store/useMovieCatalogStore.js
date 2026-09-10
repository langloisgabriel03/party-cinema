import MiniSearch from 'minisearch'
import { create } from 'zustand'

import {
  MOVIE_COLUMNS,
  fetchFirstMoviesPage,
  fetchRemainingMoviesPages,
  searchMovieTitles,
} from '@/lib/movies'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { weightedScore } from '@/data/movieCatalog'

/**
 * `title (year)` -> a URL-safe slug, for addManualMovie(). Every scraped row's slug comes from
 * Letterboxd (rt-dashboard/lb_scraper.py); a hand-added movie has no such source, so one is built
 * here instead. The `manual-` prefix is never shown anywhere in the UI (slug is a pure DB key,
 * nothing reads it) -- it exists so a slug collision with a real Letterboxd-sourced movie is
 * structurally impossible (no scraped slug starts with it), and so the row is obviously
 * hand-added to anyone reading the movies table directly.
 */
function slugify(title, year) {
  const base = String(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (Amélie -> amelie)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `manual-${base}${year ? `-${year}` : ''}`
}

/**
 * The full read-only movie catalog -- 31k rows and growing -- fetched once per session and kept
 * in memory, deliberately not persisted to localStorage (a multi-MB array would jank the main
 * thread on every synchronous JSON.stringify persist write). Distinct from useAppStore's
 * watchlist: this is the whole catalog, not any one profile's picks.
 *
 * At this size the download is the cost that matters: see MOVIE_COLUMNS in lib/movies.js for why
 * it selects columns explicitly, and searchServerSide() below for why search does not wait for
 * the whole thing to arrive.
 */
let fetched = false
let searchIndex = null
/**
 * Ids already in `movies` and in the search index. Not derived from moviesById: that map is also
 * filled by ensureMovies()'s targeted dashboard backfill, which never touches the catalog list,
 * so using it as the dedupe key would make a page silently drop any row the dashboard happened
 * to fetch first. MiniSearch throws on a duplicate id, so this guard is load-bearing, not an
 * optimisation -- server search results and paged rows overlap by design.
 */
const inCatalog = new Set()
// Guards ensureMovies() against firing duplicate requests when two components ask for
// overlapping ids in the same tick (e.g. Dashboard's watchlist section and its calendar).
const inFlight = new Set()
// Queries already asked of the server. Typing "budapest" fires on b-u-d-a-p... via the deferred
// value; without this, every prefix would be re-requested on every re-render.
const serverSearched = new Set()

/** Module-level singleton, not store state: imperative search infrastructure, not reactive data. */
export function getMovieSearchIndex() {
  return searchIndex
}

function buildSearchIndex(movies) {
  const index = new MiniSearch({
    fields: ['title', 'cast', 'director'],
    idField: 'id',
    extractField: (document, fieldName) => {
      const value = document[fieldName]
      return Array.isArray(value) ? value.join(' ') : value
    },
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      // AND, not MiniSearch's OR default: "the mask" matching every movie with just "the"
      // ANYWHERE (title/cast/director) was returning 2000+ near-random results and burying
      // the actual title. Boosting title means a title match beats an incidental cast/director
      // hit, so a movie whose title is literally the query ranks first, not somewhere in a
      // wall of unrelated movies that happen to share a supporting actor's surname.
      combineWith: 'AND',
      boost: { title: 3 },
    },
  })
  index.addAll(movies)
  return index
}

/**
 * Adds rows to the catalog list, the search index and moviesById together. Every caller goes
 * through here so those three can never disagree about what's loaded. Returns how many were
 * actually new.
 */
function addToCatalog(set, rows) {
  const fresh = rows.filter((movie) => !inCatalog.has(movie.id))
  if (!fresh.length) return 0
  const scored = fresh.map((movie) => ({ ...movie, weightedScore: weightedScore(movie) }))
  for (const movie of scored) inCatalog.add(movie.id)

  if (searchIndex) searchIndex.addAll(scored)
  else searchIndex = buildSearchIndex(scored)

  set((state) => ({
    movies: [...state.movies, ...scored],
    moviesById: new Map([...state.moviesById, ...scored.map((m) => [m.id, m])]),
  }))
  return scored.length
}

export const useMovieCatalogStore = create((set, get) => ({
  movies: [],
  moviesLoading: true,
  // Distinct from moviesLoading: that one flips false the moment page 1 lands, so the grid can
  // render fast -- but at catalog sizes past a page or two, "movies" is still incomplete at that
  // point. Without this, `{results.length} of {movies.length}` reads as a final, complete count
  // (e.g. "1000 of 1000") while ~27,000 more rows are still streaming in silently behind it.
  moreMoviesLoading: true,
  moviesError: null,
  // True while a server-side title search is in flight -- lets the grid say "checking the rest
  // of the catalog…" instead of "No movies match" for the second it takes to find out.
  serverSearching: false,
  // The single id -> movie lookup surface for the whole app (watchlist cards, night dialogs),
  // not just the /movies grid. Populated by whichever source gets there first: the full catalog
  // fetch below, or a targeted ensureMovies() backfill from the Dashboard.
  moviesById: new Map(),

  // Lazy: called from Movies.jsx's own effect, not app-wide on boot -- fetching ~16MB on every
  // app load regardless of whether the user ever opens the search page would waste mobile data.
  //
  // Progressive: page 1 (1000 rows, newest-first -- matches the default UI sort) renders as soon
  // as it lands instead of waiting on the whole 31k-row catalog, then the rest streams in a few
  // pages at a time and appends as it arrives. MiniSearch's .addAll() extends the existing index
  // rather than rebuilding it, so search works (against a growing corpus) throughout.
  initMovies: async () => {
    if (fetched) return
    fetched = true

    if (!supabaseConfigured) {
      set({ moviesLoading: false, moreMoviesLoading: false, moviesError: 'Supabase is not configured yet.' })
      return
    }

    try {
      addToCatalog(set, await fetchFirstMoviesPage())
      set({ moviesLoading: false, moviesError: null })

      // Appends as each batch lands rather than once at the end -- see fetchRemainingMoviesPages.
      await fetchRemainingMoviesPages((rows) => addToCatalog(set, rows))
      set({ moreMoviesLoading: false })
    } catch (error) {
      set({ moviesLoading: false, moreMoviesLoading: false, moviesError: error.message })
    }
  },

  /**
   * Asks Postgres for title matches and merges them into the catalog, so a search finds a film
   * that hasn't streamed in yet.
   *
   * Purely an assist for the gap before the catalog is fully loaded: MiniSearch is the better
   * search once it is (cast, director, ranking, fuzziness), and these rows go into the same
   * index, so the results simply become part of the local corpus. Failure is a console warning,
   * never moviesError -- "couldn't load the movie catalog" would be a lie about what broke, and
   * local search over what has loaded still works.
   */
  searchServerSide: async (query) => {
    const q = query.trim()
    // Under two characters the server would return an arbitrary 40 of thousands of matches --
    // no help, and the local index has plenty for a prefix that short.
    if (!supabaseConfigured || q.length < 2 || serverSearched.has(q)) return
    serverSearched.add(q)
    set({ serverSearching: true })
    try {
      addToCatalog(set, await searchMovieTitles(q))
    } catch (error) {
      console.warn('server-side title search failed', error.message)
      serverSearched.delete(q) // let a retry happen on the next keystroke
    } finally {
      set({ serverSearching: false })
    }
  },

  // Backfills just the handful of movies the Dashboard actually references (watchlist + nights),
  // not the whole catalog -- one request, typically a couple dozen rows. Same code path serves
  // the initial load and every live watchlist insert from a friend, since a realtime INSERT
  // payload on watchlist_items carries only the bare movie_id, never the joined movie record.
  ensureMovies: async (ids) => {
    if (!supabaseConfigured || !ids.length) return
    const have = get().moviesById
    const missing = ids.filter((id) => !have.has(id) && !inFlight.has(id))
    if (!missing.length) return
    missing.forEach((id) => inFlight.add(id))

    const { data, error } = await supabase.from('movies').select(MOVIE_COLUMNS).in('id', missing)
    missing.forEach((id) => inFlight.delete(id))
    if (error) {
      set({ moviesError: error.message })
      return
    }

    // Replace the Map, never mutate it in place: Zustand compares with Object.is, so an
    // in-place .set() on the existing Map changes nothing observable and nothing re-renders.
    set((state) => {
      const next = new Map(state.moviesById)
      for (const row of data) next.set(row.id, { ...row, weightedScore: weightedScore(row) })
      return { moviesById: next }
    })
  },

  /**
   * Admin-only (gated in the UI by isAdmin(), see MovieCard.jsx) permanent removal of a catalog
   * entry -- a duplicate, a mismatched RT page, spam from a broad sitemap scrape. Requires
   * supabase/movies_admin_schema.sql's anon DELETE policy on movies, which movies_schema.sql
   * deliberately didn't ship with (every write used to be sync_to_supabase.py's service_role
   * only). Non-optimistic on purpose: this is the one destructive, hard-to-undo action in this
   * store, and the caller (MovieCard's two-tap confirm) has already made the user commit to it --
   * removing it from view before the request actually lands would be one more thing to unwind if
   * it fails.
   *
   * Also tombstones the slug in deleted_movies so sync_to_supabase.py's next run doesn't quietly
   * resurrect it from the local scrape pipeline -- see that table's own comment for why the
   * generic deleted_rows undo log (movies_admin_schema.sql's other trigger) isn't enough on its
   * own. Best-effort: if the tombstone insert fails, the movie is still gone from the catalog
   * either way, so this only warns rather than rolling the deletion back.
   */
  removeMovie: async (movieId) => {
    const { data: row, error } = await supabase
      .from('movies')
      .delete()
      .eq('id', movieId)
      .select('slug, title, poster')
      .single()
    // `!row` alongside `error`, not just `error`: RLS silently filtering out every row a DELETE
    // would've touched (e.g. movies_admin_schema.sql's anon DELETE policy not pasted in yet)
    // isn't a Postgres error at all -- it's a successful delete-of-zero-rows, so .single()'s
    // "expected exactly one row" complaint is the only signal something didn't happen. Without
    // this check that reads as success and `row.slug` below throws into an unhandled rejection,
    // leaving DeleteRow's confirm button stuck on "Removing…" forever with no visible error.
    if (error || !row) {
      const message = error?.message ?? 'Nothing was deleted -- missing permission?'
      set({ moviesError: message })
      return { error: message }
    }

    inCatalog.delete(movieId)
    searchIndex?.discard(movieId)
    set((state) => ({
      movies: state.movies.filter((m) => m.id !== movieId),
      moviesById: new Map([...state.moviesById].filter(([id]) => id !== movieId)),
    }))

    const { error: tombstoneError } = await supabase
      .from('deleted_movies')
      .insert({ slug: row.slug, title: row.title })
    if (tombstoneError) {
      console.warn(
        `Deleted "${row.title}" but couldn't tombstone its slug -- a future catalog sync may ` +
          `bring it back (has movies_admin_schema.sql been run?):`,
        tombstoneError.message
      )
    }
    return { title: row.title }
  },

  /**
   * Admin-only "add a movie by hand" -- a title fetch-rt-movie.ts scraped from a pasted Rotten
   * Tomatoes link (or one the admin typed in from scratch, if a field needed correcting or the
   * scrape failed). `fields` is whatever AddMovieDialog collected; every column besides
   * title/year is nullable or array-defaulted in the schema, so a sparse manual entry is fine.
   *
   * data_sources: ['manual'] is not decoration -- sync_to_supabase.py's
   * fetch_manually_added_slugs() reads it to protect this row from its local-deletions cleanup
   * pass. Without that tag, the very next sync run would delete this row outright: there is no
   * local SQLite record backing it, so it looks identical to "removed from every list".
   *
   * Retries on a slug collision (23505) with an incrementing suffix rather than failing outright
   * -- two people adding "Dune" the same afternoon, or re-adding a title after deleting it under
   * a slightly different year, shouldn't need a manual rename.
   */
  addManualMovie: async (fields) => {
    // title and year are NOT NULL in the schema (movies_schema.sql) -- checked here too, not
    // just in AddMovieDialog's form validation, since this action is the actual source of truth
    // and a 23502 constraint violation from Postgres would be a far less useful error to show.
    if (!fields.title?.trim()) return { error: 'Title is required.' }
    if (!fields.year) return { error: 'Year is required.' }

    const base = slugify(fields.title, fields.year)
    const now = new Date().toISOString()
    const row = {
      ...fields,
      decade: fields.year ? Math.floor(fields.year / 10) * 10 : null,
      data_sources: ['manual'],
      rt_last_refreshed: now,
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
      const { data, error } = await supabase
        .from('movies')
        .insert({ ...row, slug })
        .select(MOVIE_COLUMNS)
        .single()
      if (!error) {
        addToCatalog(set, [data])
        return { movie: data }
      }
      if (error.code !== '23505') return { error: error.message }
      // else: slug taken, loop and try the next suffix
    }
    return { error: 'Could not find a free slug after several attempts -- try a different title.' }
  },
}))
