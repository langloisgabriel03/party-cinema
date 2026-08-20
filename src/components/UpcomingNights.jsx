import { formatNightDate } from '@/data/dates'

export default function UpcomingNights({ nights, moviesById, nightMoviesByNight, onSelect }) {
  if (nights.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No nights planned yet — tap a date on the calendar to schedule one.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {nights.map((night) => {
        const movieIds = nightMoviesByNight.get(night.id) ?? []
        const firstMovie = movieIds.length ? moviesById.get(movieIds[0]) : null
        const extraCount = movieIds.length - 1

        return (
          <button
            key={night.id}
            type="button"
            onClick={() => onSelect(night.scheduled_for)}
            className="flex cursor-pointer items-center gap-3 rounded-lg bg-ink-soft p-3 text-left hover:bg-ink-raised"
          >
            {firstMovie?.poster ? (
              <img
                src={firstMovie.poster}
                alt=""
                className="aspect-2/3 w-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex aspect-2/3 w-12 shrink-0 items-center justify-center rounded bg-ink-raised text-xs text-neutral-600">
                {movieIds.length ? '…' : ''}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-400">{formatNightDate(night.scheduled_for)}</p>
              <p className="truncate text-sm font-medium text-white">
                {firstMovie
                  ? `${firstMovie.title}${extraCount > 0 ? ` +${extraCount} more` : ''}`
                  : movieIds.length
                    ? '…'
                    : 'No film picked yet'}
              </p>
              {night.note && <p className="truncate text-xs text-neutral-500">{night.note}</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
