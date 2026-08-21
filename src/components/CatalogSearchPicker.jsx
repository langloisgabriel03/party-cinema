import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { resolveSearchMatches, scoreColor } from '@/data/movieCatalog'
import { useDragScroll } from '@/lib/useDragScroll'
import { getMovieSearchIndex, useMovieCatalogStore } from '@/store/useMovieCatalogStore'

/**
 * Defaults to a slider of the shared watchlist (the likely pick, already right there) -- typing
 * a query swaps that slider for full-catalog search results instead, reusing the exact same
 * search resolution as /movies (AND-combine, title-boost, year-aware parsing). The catalog fetch
 * is lazy, triggered on first open: nothing loads until someone is actually about to search.
 *
 * Shared between NightDialog (picking a film for a night) and Roulette (adding to the pool) --
 * both want "search everything, default to the watchlist" with a caller-supplied exclude list.
 */
export default function CatalogSearchPicker({ onPick, excludeIds, watchlistEntries }) {
  const movies = useMovieCatalogStore((state) => state.movies)
  const moviesLoading = useMovieCatalogStore((state) => state.moviesLoading)
  const initMovies = useMovieCatalogStore((state) => state.initMovies)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isSearching = deferredQuery.trim().length > 0
  const drag = useDragScroll()

  useEffect(() => {
    initMovies()
  }, [initMovies])

  const searchResults = useMemo(() => {
    if (!isSearching || !movies.length) return []
    const match = resolveSearchMatches(deferredQuery, movies, getMovieSearchIndex())
    if (!match) return []
    const movieById = new Map(movies.map((m) => [m.id, m]))
    return [...match.order.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => movieById.get(id))
      .filter((movie) => movie && !excludeIds.includes(movie.id))
      .slice(0, 20)
  }, [movies, deferredQuery, isSearching, excludeIds])

  const watchlistMovies = useMemo(
    () =>
      watchlistEntries
        .filter((entry) => entry.movie && !excludeIds.includes(entry.movieId))
        .map((entry) => entry.movie),
    [watchlistEntries, excludeIds]
  )

  const visible = isSearching ? searchResults : watchlistMovies

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the movie database…"
        className="rounded border border-neutral-700 bg-ink-raised px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
      />
      {isSearching && moviesLoading && <p className="text-xs text-neutral-500">Loading the catalog…</p>}
      {!isSearching && watchlistMovies.length === 0 && (
        <p className="text-xs text-neutral-500">
          Watchlist is empty — search above, or add movies from the search page.
        </p>
      )}
      {isSearching && !moviesLoading && searchResults.length === 0 && (
        <p className="text-xs text-neutral-500">No matches.</p>
      )}
      {visible.length > 0 && (
        <div
          ref={drag.ref}
          {...drag.handlers}
          className="flex cursor-grab gap-2 overflow-x-auto pb-1 active:cursor-grabbing"
        >
          {visible.map((movie) => (
            <button
              key={movie.id}
              type="button"
              title={movie.title}
              onClick={() => onPick(movie.id)}
              draggable={false}
              className="flex w-20 shrink-0 cursor-pointer flex-col gap-0.5 overflow-hidden rounded text-left"
            >
              {movie.poster ? (
                <img
                  src={movie.poster}
                  alt=""
                  draggable={false}
                  className="aspect-2/3 w-full rounded object-cover"
                />
              ) : (
                <div className="flex aspect-2/3 w-full items-center justify-center rounded bg-ink-raised px-1 text-center text-[10px] text-neutral-500">
                  {movie.title}
                </div>
              )}
              <span className="text-[10px] text-neutral-500">{movie.year}</span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold">
                <span className={scoreColor(movie.tomatometer)}>
                  🍅{movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
                </span>
                <span className={scoreColor(movie.audience_score)}>
                  🍿{movie.audience_score != null ? `${movie.audience_score}%` : '—'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
