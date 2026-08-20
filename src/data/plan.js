// Pure data helpers for the watchlist + nights domain -- no React here, mirrors movieCatalog.js's role.

import { todayISO } from '@/data/dates'

/**
 * Every movie id referenced by either table -- the backfill list for useMovieCatalogStore's
 * ensureMovies(). Deduplicated since a movie can be both on the watchlist and attached to a night.
 */
export function referencedMovieIds(watchlist, nights) {
  const ids = new Set()
  for (const item of watchlist) ids.add(item.movie_id)
  for (const night of nights) if (night.movie_id != null) ids.add(night.movie_id)
  return [...ids]
}

/**
 * Groups the flat watchlist_items rows by movie -- "3/3 want this" is the whole point of the
 * feature, so vote count desc is the primary sort, earliest-added breaks ties. `movie` is null
 * until useMovieCatalogStore's ensureMovies() backfills it -- render a poster skeleton for that
 * gap, not a hole.
 */
export function groupWatchlist(watchlist, moviesById, profiles) {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const byMovie = new Map()
  for (const item of watchlist) {
    if (!byMovie.has(item.movie_id)) {
      byMovie.set(item.movie_id, {
        movieId: item.movie_id,
        movie: moviesById.get(item.movie_id) ?? null,
        wantedBy: [],
        addedAt: item.created_at,
      })
    }
    const entry = byMovie.get(item.movie_id)
    const profile = profileById.get(item.added_by)
    if (profile) entry.wantedBy.push(profile)
    if (item.created_at < entry.addedAt) entry.addedAt = item.created_at
  }
  return [...byMovie.values()].sort(
    (a, b) => b.wantedBy.length - a.wantedBy.length || a.addedAt.localeCompare(b.addedAt)
  )
}

/** scheduled_for asc, then start_time asc -- untimed nights ("sometime that day") sort first. */
export function sortNights(nights) {
  return [...nights].sort((a, b) => {
    if (a.scheduled_for !== b.scheduled_for) return a.scheduled_for.localeCompare(b.scheduled_for)
    if (a.start_time == null && b.start_time == null) return 0
    if (a.start_time == null) return -1
    if (b.start_time == null) return 1
    return a.start_time.localeCompare(b.start_time)
  })
}

/** Nights today or later -- what "Upcoming" shows; past nights are just history, not hidden. */
export function upcomingNights(nights) {
  const today = todayISO()
  return sortNights(nights).filter((night) => night.scheduled_for >= today)
}

export function nextUpcomingNight(nights) {
  return upcomingNights(nights)[0] ?? null
}
