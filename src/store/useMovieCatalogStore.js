import MiniSearch from 'minisearch'
import { create } from 'zustand'

import { fetchFirstMoviesPage, fetchRemainingMoviesPages } from '@/lib/movies'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { weightedScore } from '@/data/movieCatalog'

/**
 * The full read-only movie catalog (~5,851 rows), fetched once per session and kept in memory --
 * deliberately not persisted to localStorage (see plan: a multi-MB array would jank the main
 * thread on every synchronous JSON.stringify persist write). Distinct from useAppStore's future
 * watchlist concept -- this is the whole catalog, not any one profile's picks.
 */
let fetched = false
let searchIndex = null
// Guards ensureMovies() against firing duplicate requests when two components ask for
// overlapping ids in the same tick (e.g. Dashboard's watchlist section and its calendar).
const inFlight = new Set()

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

export const useMovieCatalogStore = create((set, get) => ({
  movies: [],
  moviesLoading: true,
  // Distinct from moviesLoading: that one flips false the moment page 1 lands, so the grid can
  // render fast -- but at catalog sizes past a page or two, "movies" is still incomplete at that
  // point. Without this, `{results.length} of {movies.length}` reads as a final, complete count
  // (e.g. "1000 of 1000") while ~27,000 more rows are still streaming in silently behind it.
  moreMoviesLoading: true,
  moviesError: null,
  // The single id -> movie lookup surface for the whole app (watchlist cards, night dialogs),
  // not just the /movies grid. Populated by whichever source gets there first: the full catalog
  // fetch below, or a targeted ensureMovies() backfill from the Dashboard.
  moviesById: new Map(),

  // Lazy: called from Movies.jsx's own effect, not app-wide on boot -- fetching ~2-5MB on every
  // app load regardless of whether the user ever opens the search page would waste mobile data.
  //
  // Progressive: page 1 (1000 rows, newest-first -- matches the default UI sort) renders as soon
  // as it lands instead of waiting on the whole ~5,851-row catalog, then the rest streams in and
  // appends in the background. MiniSearch's .addAll() extends the existing index rather than
  // rebuilding it, so search works (against a growing corpus) throughout.
  initMovies: async () => {
    if (fetched) return
    fetched = true

    if (!supabaseConfigured) {
      set({ moviesLoading: false, moreMoviesLoading: false, moviesError: 'Supabase is not configured yet.' })
      return
    }

    try {
      const firstRows = await fetchFirstMoviesPage()
      const first = firstRows.map((movie) => ({ ...movie, weightedScore: weightedScore(movie) }))
      searchIndex = buildSearchIndex(first)
      set((state) => ({
        movies: first,
        moviesById: new Map([...state.moviesById, ...first.map((m) => [m.id, m])]),
        moviesLoading: false,
        moviesError: null,
      }))

      const restRows = await fetchRemainingMoviesPages()
      if (restRows.length) {
        const rest = restRows.map((movie) => ({ ...movie, weightedScore: weightedScore(movie) }))
        searchIndex.addAll(rest)
        set((state) => ({
          movies: [...state.movies, ...rest],
          moviesById: new Map([...state.moviesById, ...rest.map((m) => [m.id, m])]),
        }))
      }
      set({ moreMoviesLoading: false })
    } catch (error) {
      set({ moviesLoading: false, moreMoviesLoading: false, moviesError: error.message })
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

    const { data, error } = await supabase.from('movies').select('*').in('id', missing)
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
}))
