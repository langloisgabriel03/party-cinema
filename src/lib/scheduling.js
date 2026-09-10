/**
 * "Put this film on this date" -- the one place that knows what booking a night actually
 * involves, so the three ways to reach it (the calendar dialog, a watchlist card, settling a
 * date poll) can't drift apart on the parts that are easy to get subtly wrong: attaching to a
 * night that already exists rather than making a rival one, and never notifying about a date
 * that has already passed.
 *
 * Lives here rather than in usePlanStore because it composes store writes with a push call --
 * the store deliberately knows nothing about notifications.
 */

import { isPastDate } from '@/data/dates'
import { notifyNightBooked } from '@/lib/push'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * Returns the night the film ended up on, or null if it couldn't be booked.
 *
 * `getState()` rather than hooks: this runs from event handlers, and reading the live store here
 * means the caller never has to pass six actions down. Notification is skipped for a past date
 * (that's someone logging a film we already watched, not booking anything -- see
 * src/data/plan.js's watchedEntries) and, as always, when attaching to a night that already
 * exists, since that isn't a "night was booked" event.
 */
export async function scheduleMovieOn(iso, movieId, profileId) {
  const { nights, nightMoviesByNight, scheduleNight, addMovieToNight } = usePlanStore.getState()

  const existing = nights.find((night) => night.scheduled_for === iso)
  if (existing) {
    if (!(nightMoviesByNight.get(existing.id) ?? []).includes(movieId)) {
      await addMovieToNight(existing.id, movieId, profileId)
    }
    await settleDatePoll(movieId)
    return existing
  }

  const night = await scheduleNight({ scheduledFor: iso, createdBy: profileId })
  if (!night) return null

  // Awaited before notifying: notify-night reads night_movies to name the film, so the row has
  // to exist first or the push goes out as a bare date with no title.
  await addMovieToNight(night.id, movieId, profileId)
  if (!isPastDate(iso)) notifyNightBooked(night.id)
  await settleDatePoll(movieId)
  return night
}

/**
 * A film that now has a date is no longer a question, so an open poll for it closes here rather
 * than only in the poll dialog -- otherwise booking one from the calendar would leave the strip
 * asking everyone to find a date for a night that's already on the calendar.
 *
 * Read fresh from the store rather than reusing the destructured snapshot above: the writes in
 * between have replaced it.
 */
async function settleDatePoll(movieId) {
  const { datePolls, closeDatePoll } = usePlanStore.getState()
  if (datePolls.some((poll) => poll.movie_id === movieId)) await closeDatePoll(movieId)
}
