// Pure data helpers for the watchlist + nights domain -- no React here, mirrors movieCatalog.js's role.

import { isPastDate, todayISO } from '@/data/dates'

/**
 * Every movie id referenced anywhere -- the backfill list for useMovieCatalogStore's
 * ensureMovies(). Deduplicated since a movie can be both on the watchlist and attached to a night.
 */
export function referencedMovieIds(watchlist, nightMovies) {
  const ids = new Set()
  for (const item of watchlist) ids.add(item.movie_id)
  for (const nm of nightMovies) ids.add(nm.movie_id)
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

/** scheduled_for asc -- nights are day-only, so date is the whole sort key. */
export function sortNights(nights) {
  return [...nights].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
}

/** Nights today or later -- what "Upcoming" shows; past nights are just history, not hidden. */
export function upcomingNights(nights) {
  const today = todayISO()
  return sortNights(nights).filter((night) => night.scheduled_for >= today)
}

export function nextUpcomingNight(nights) {
  return upcomingNights(nights)[0] ?? null
}

/** Nights that have already happened, most recent first -- the Watched section's source. */
export function pastNights(nights) {
  return sortNights(nights).filter((night) => isPastDate(night.scheduled_for)).reverse()
}

/**
 * Films attached to a night that has already been and gone -- the "Watched" list.
 *
 * Derived from nights rather than the watchlist on purpose: a film logged straight onto a past
 * date (the "we already saw this, just record it" flow) was never on anyone's watchlist, and
 * should still count as watched. One row per movie, keyed on the most recent showing, so a
 * rewatch is a `times` count instead of the same poster twice.
 *
 * `watchedBy` is the going RSVPs of that showing -- often empty for a night logged after the
 * fact, so it's decoration, never the reason a row exists.
 */
export function watchedEntries({ nights, nightMoviesByNight, moviesById, rsvpsByNight, profiles }) {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const byMovie = new Map()
  // pastNights() is most-recent-first, so the first time a movie turns up IS its latest showing.
  for (const night of pastNights(nights)) {
    for (const movieId of nightMoviesByNight.get(night.id) ?? []) {
      const existing = byMovie.get(movieId)
      if (existing) {
        existing.times += 1
        continue
      }
      byMovie.set(movieId, {
        movieId,
        movie: moviesById.get(movieId) ?? null,
        watchedOn: night.scheduled_for,
        nightId: night.id,
        times: 1,
        watchedBy: (rsvpsByNight?.get(night.id) ?? [])
          .filter((rsvp) => rsvp.going)
          .map((rsvp) => profileById.get(rsvp.profile_id))
          .filter(Boolean),
      })
    }
  }
  return [...byMovie.values()]
}

/**
 * Watchlist entries with everything already watched taken out -- "Soon to watch" is a to-do
 * list, so a film that's had its night belongs under Watched instead, not in both places.
 */
export function unwatchedEntries(entries, watched) {
  const seen = new Set(watched.map((entry) => entry.movieId))
  return entries.filter((entry) => !seen.has(entry.movieId))
}
