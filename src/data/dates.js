/**
 * Date-only values, deliberately kept away from Date's UTC-parsing paths.
 *
 * new Date('2026-08-25') parses as UTC midnight -- in any negative-offset zone that renders as
 * Aug 24, so the calendar would dot the wrong day. And new Date().toISOString().slice(0, 10)
 * returns the UTC date, so at 20:00 in a negative-offset zone it already reads "tomorrow": a
 * night scheduled for tonight would drop out of "Upcoming" at exactly the hour everyone sits
 * down to watch it.
 *
 * Every Date handed to the calendar/UI comes from fromISODate(). Every date written to Supabase
 * comes from toISODate(). No exceptions -- that's the entire bug class, closed.
 */

export function toISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export const todayISO = () => toISODate(new Date())

export function fromISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day) // local midnight, never UTC
}

/** "Fri, Aug 25" -- used on night cards/dialogs. */
export function formatNightDate(iso) {
  return fromISODate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Strictly before today, in the viewer's own zone. A night scheduled for *today* is still
 * ahead of us (that's the same boundary upcomingNights() uses), so it is not history.
 */
export const isPastDate = (iso) => iso < todayISO()

/**
 * "Aug 25" -- or "Aug 25, 2025" once it's not this year. Used on watched rows, where the
 * weekday no longer matters but telling last August from this one does.
 */
export function formatWatchedDate(iso) {
  const date = fromISODate(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
