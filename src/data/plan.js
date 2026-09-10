// Pure data helpers for the watchlist + nights domain -- no React here, mirrors movieCatalog.js's role.

import { isPastDate, todayISO } from '@/data/dates'

/**
 * Every movie id referenced anywhere -- the backfill list for useMovieCatalogStore's
 * ensureMovies(). Deduplicated since a movie can be on the watchlist, attached to a night and
 * being polled for a date all at once. Polls are included because a film can be dropped from the
 * watchlist while its poll is still open, and a poll card with no poster or title is useless.
 */
export function referencedMovieIds(watchlist, nightMovies, datePolls = []) {
  const ids = new Set()
  for (const item of watchlist) ids.add(item.movie_id)
  for (const nm of nightMovies) ids.add(nm.movie_id)
  for (const poll of datePolls) ids.add(poll.movie_id)
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

/**
 * The open date polls, joined to their films and newest question first -- what the dashboard
 * shows above the calendar. `movie` is null until useMovieCatalogStore's ensureMovies() backfills
 * it, same contract as groupWatchlist().
 */
export function openPolls(datePolls, moviesById) {
  return [...datePolls]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map((poll) => ({
      movieId: poll.movie_id,
      movie: moviesById.get(poll.movie_id) ?? null,
      createdBy: poll.created_by,
    }))
}

/**
 * Counts up one poll's answers against a fixed list of candidate days.
 *
 * `dates` is passed in rather than derived from the rows so the grid stays the same shape
 * whether or not anyone has answered, and so a stale row for a day that has since passed simply
 * doesn't appear (no filtering, no cleanup job -- the day just stops being offered).
 *
 * Returns `byDate` (Map<iso, profile[]>), `best` (the days with the most takers, ties included,
 * empty until someone answers), `mine` (a Set of the current profile's days, for the toggled
 * state of each chip) and `responders` (everyone who has answered at all, for "3 of 5 replied").
 */
export function summarizePoll({ rows, dates, profiles, profileId }) {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const offered = new Set(dates)
  const byDate = new Map(dates.map((iso) => [iso, []]))
  const mine = new Set()
  const responders = new Set()

  for (const row of rows) {
    if (!offered.has(row.available_on)) continue // a day that has since passed
    const profile = profileById.get(row.profile_id)
    if (profile) byDate.get(row.available_on).push(profile)
    responders.add(row.profile_id)
    if (row.profile_id === profileId) mine.add(row.available_on)
  }

  const top = Math.max(0, ...dates.map((iso) => byDate.get(iso).length))
  return {
    byDate,
    best: top > 0 ? dates.filter((iso) => byDate.get(iso).length === top) : [],
    topCount: top,
    mine,
    responders: [...responders].map((id) => profileById.get(id)).filter(Boolean),
  }
}

/**
 * Short, human-readable list of where a movie is currently in active use -- the watchlist, a
 * planned or already-watched night, the roulette pool, an open date poll -- for the admin delete
 * confirmation on /movies (MovieCard.jsx). Deleting the catalog row cascades to remove it from
 * every one of these (see movies_admin_schema.sql's comment on the FKs involved); this is what
 * lets that confirmation say what's actually at stake instead of a blanket "are you sure?".
 *
 * Takes plain arrays/Maps rather than reading the stores itself -- this file stays store-free
 * (see the header comment), and the caller already has all four from a single
 * usePlanStore.getState() snapshot.
 */
export function movieReferences(movieId, { watchlist, nightMovies, rouletteEntries, datePolls }) {
  const notes = []
  if (watchlist.some((item) => item.movie_id === movieId)) notes.push('the watchlist')
  if (nightMovies.some((nm) => nm.movie_id === movieId)) notes.push('a movie night')
  if (rouletteEntries.some((item) => item.movie_id === movieId)) notes.push('the roulette pool')
  if (datePolls.some((poll) => poll.movie_id === movieId)) notes.push('an open date poll')
  return notes
}
