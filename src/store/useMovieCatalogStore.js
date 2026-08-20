import MiniSearch from 'minisearch'
import { create } from 'zustand'

import { fetchAllMovies } from '@/lib/movies'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { weightedScore } from '@/data/movieCatalog'

/**
 * The full read-only movie catalog (~5,851 rows), fetched once per session and kept in memory --
 * deliberately not persisted to localStorage (see plan: a multi-MB array would jank the main
 * thread on every synchronous JSON.stringify persist write). Distinct from useAppStore's future
 * watchlist concept -- this is the whole catalog, not any one profile's picks.
 */
let fetched = false
let searchIndex = null

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
  })
  index.addAll(movies)
  return index
}

export const useMovieCatalogStore = create((set) => ({
  movies: [],
  moviesLoading: true,
  moviesError: null,

  // Lazy: called from Movies.jsx's own effect, not app-wide on boot -- fetching ~2-5MB on every
  // app load regardless of whether the user ever opens the search page would waste mobile data.
  initMovies: async () => {
    if (fetched) return
    fetched = true

    if (!supabaseConfigured) {
      set({ moviesLoading: false, moviesError: 'Supabase is not configured yet.' })
      return
    }

    try {
      const rows = await fetchAllMovies()
      const movies = rows.map((movie) => ({ ...movie, weightedScore: weightedScore(movie) }))
      searchIndex = buildSearchIndex(movies)
      set({ movies, moviesLoading: false, moviesError: null })
    } catch (error) {
      set({ moviesLoading: false, moviesError: error.message })
    }
  },
}))
