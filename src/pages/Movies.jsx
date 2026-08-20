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
  parseSearchQuery,
  resolveSearchMatches,
} from '@/data/movieCatalog'
import { getMovieSearchIndex, useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

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
  const initPlan = usePlanStore((state) => state.initPlan)

  useEffect(() => {
    initMovies()
    initPlan()
  }, [initMovies, initPlan])

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

  // Split from the filter/sort memo below so toggling a genre chip doesn't re-run MiniSearch,
  // and so the fallback-to-plain-text decision (see resolveSearchMatches) happens on the raw
  // match set, before any filter has a chance to influence it.
  const match = useMemo(
    () => (movies.length ? resolveSearchMatches(deferredQuery, movies, getMovieSearchIndex()) : null),
    [movies, deferredQuery]
  )

  const results = useMemo(() => {
    if (!movies.length) return []
    const filtered = filterMovies(movies, filters, match?.ids ?? null)
    // While actively searching, best matches first (MiniSearch's own relevance order, with
    // year-only matches sharing one rank -- see `ranked()`) -- the "Sort by" field only governs
    // order when browsing without a search term. Re-sorting a search alphabetically/by-year was
    // burying the actual match past page 1. Every matched id has a rank entry (never undefined),
    // so this can't degrade into a NaN comparator.
    const bySort = compareBy(filters.sortBy, filters.sortDesc)
    filtered.sort(
      match ? (a, b) => match.order.get(a.id) - match.order.get(b.id) || bySort(a, b) : bySort
    )
    return filtered
  }, [movies, match, filters])

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

        {(match?.yearPrefix || activeFilters.length > 0) && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {match?.yearPrefix && (
              <button
                type="button"
                title="Reading this as a year -- click to search it as plain text instead"
                onClick={() => setRawQuery(parseSearchQuery(rawQuery).text)}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-xs whitespace-nowrap text-brand hover:bg-brand/30"
              >
                Year {match.yearPrefix}… <span className="text-brand/70">×</span>
              </button>
            )}
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
