import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import MovieCard from '@/components/MovieCard'
import MovieFilterDialog from '@/components/MovieFilterDialog'
import filterSchema from '@/data/filterSchema.json'
import {
  compareBy,
  createDefaultFilters,
  deriveFilterBounds,
  describeActiveFilters,
  filterMovies,
  getDistinctFranchises,
  getPresentGenres,
} from '@/data/movieCatalog'
import { getMovieSearchIndex, useMovieCatalogStore } from '@/store/useMovieCatalogStore'

const PAGE_SIZE = 30
// Wide static fallback so the year filter never excludes anything before real data loads --
// once movies arrive, `bounds` (used for labels and the "cleared?" comparison) reflects the
// actual range automatically, with no separate re-sync step needed.
const FALLBACK_BOUNDS = { yearMin: 1900, yearMax: new Date().getFullYear() }

export default function Movies() {
  const movies = useMovieCatalogStore((state) => state.movies)
  const moviesLoading = useMovieCatalogStore((state) => state.moviesLoading)
  const moviesError = useMovieCatalogStore((state) => state.moviesError)
  const initMovies = useMovieCatalogStore((state) => state.initMovies)

  useEffect(() => {
    initMovies()
  }, [initMovies])

  const bounds = useMemo(() => deriveFilterBounds(movies), [movies])
  const presentGenres = useMemo(
    () => getPresentGenres(movies, filterSchema.canonical_genres),
    [movies]
  )
  const distinctFranchises = useMemo(() => getDistinctFranchises(movies), [movies])

  const [rawQuery, setRawQuery] = useState('')
  const deferredQuery = useDeferredValue(rawQuery)
  const [filters, setFilters] = useState(() => createDefaultFilters(FALLBACK_BOUNDS))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [page, setPage] = useState(1)
  const gridTopRef = useRef(null)

  // One-time sync once real data arrives: the year filter starts at a wide static fallback (see
  // FALLBACK_BOUNDS) so it never excludes anything before load, but that means it'd otherwise
  // permanently mismatch the real `bounds` and show as a false "active" chip. Only syncs if the
  // user hasn't touched the year filter yet -- before movies load there's nothing to touch anyway
  // (the filter dialog has no options until then), so this can't clobber a real user choice.
  useEffect(() => {
    if (!movies.length) return
    setFilters((f) =>
      f.yearMin === FALLBACK_BOUNDS.yearMin && f.yearMax === FALLBACK_BOUNDS.yearMax
        ? { ...f, yearMin: bounds.yearMin, yearMax: bounds.yearMax }
        : f
    )
  }, [movies.length, bounds])

  const results = useMemo(() => {
    if (!movies.length) return []
    let matchIds = null
    const query = deferredQuery.trim()
    if (query) {
      const index = getMovieSearchIndex()
      matchIds = new Set(index ? index.search(query, { prefix: true, fuzzy: 0.2 }).map((r) => r.id) : [])
    }
    const filtered = filterMovies(movies, filters, matchIds)
    filtered.sort(compareBy(filters.sortBy, filters.sortDesc))
    return filtered
  }, [movies, deferredQuery, filters])

  // Reset to page 1 whenever the filtered/sorted result set changes identity.
  useEffect(() => setPage(1), [results])

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const pageResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const activeFilters = describeActiveFilters(filters, bounds)

  const goToPage = (next) => {
    setPage(Math.min(Math.max(1, next), totalPages))
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <AppHeader>
        <Link
          to="/dashboard"
          className="text-sm text-neutral-400 transition-colors hover:text-white"
        >
          ← Dashboard
        </Link>
      </AppHeader>

      <div className="sticky top-0 z-10 flex flex-col gap-3 bg-ink px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search title, actor, or director…"
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-ink-raised px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
          />
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="relative cursor-pointer rounded border border-neutral-700 bg-ink-raised px-4 py-2.5 text-sm text-neutral-200 hover:border-neutral-400"
          >
            Filters
            {activeFilters.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                {activeFilters.length}
              </span>
            )}
          </button>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeFilters.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, ...chip.clear }))}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-ink-raised px-3 py-1 text-xs whitespace-nowrap text-neutral-300 hover:bg-neutral-700"
              >
                {chip.label} <span className="text-neutral-500">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="flex-1 px-4 pb-16 sm:px-8">
        <div ref={gridTopRef} />

        {moviesLoading && <p className="pt-8 text-center text-neutral-500">Loading movies…</p>}

        {moviesError && (
          <p className="pt-8 text-center text-sm text-red-400">
            Couldn&rsquo;t load the movie catalog: {moviesError}
          </p>
        )}

        {!moviesLoading && !moviesError && (
          <>
            <p className="py-3 text-sm text-neutral-500">
              {results.length} of {movies.length} movies
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {pageResults.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>

            {results.length === 0 && (
              <p className="pt-8 text-center text-neutral-500">No movies match these filters.</p>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-8">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  className="min-h-11 min-w-11 cursor-pointer rounded border border-neutral-700 px-5 py-2.5 text-sm text-neutral-200 hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-sm text-neutral-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                  className="min-h-11 min-w-11 cursor-pointer rounded border border-neutral-700 px-5 py-2.5 text-sm text-neutral-200 hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <MovieFilterDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        filters={filters}
        setFilters={setFilters}
        bounds={bounds}
        presentGenres={presentGenres}
        distinctFranchises={distinctFranchises}
        onClearAll={() => setFilters(createDefaultFilters(bounds))}
      />
    </div>
  )
}
