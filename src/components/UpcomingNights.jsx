import { formatNightDate, formatTime } from '@/data/dates'

export default function UpcomingNights({ nights, moviesById, onSelect }) {
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
        const movie = night.movie_id ? moviesById.get(night.movie_id) : null
        return (
          <button
            key={night.id}
            type="button"
            onClick={() => onSelect(night.scheduled_for)}
            className="flex cursor-pointer items-center gap-3 rounded-lg bg-ink-soft p-3 text-left hover:bg-ink-raised"
          >
            <div className="flex w-16 shrink-0 flex-col items-center">
              <span className="text-xs text-neutral-400">{formatNightDate(night.scheduled_for)}</span>
              {night.start_time && (
                <span className="text-xs text-neutral-500">{formatTime(night.start_time)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {movie ? movie.title : night.movie_id ? '…' : 'No film picked yet'}
              </p>
              {night.note && <p className="truncate text-xs text-neutral-500">{night.note}</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
