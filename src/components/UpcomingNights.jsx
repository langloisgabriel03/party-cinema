import { formatNightDate } from '@/data/dates'
import { usePlanStore } from '@/store/usePlanStore'

export default function UpcomingNights({ nights, moviesById, nightMoviesByNight, onSelect }) {
  const rsvpsByNight = usePlanStore((state) => state.rsvpsByNight)

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
        const movies = movieIds.map((id) => moviesById.get(id)).filter(Boolean)
        const goingCount = (rsvpsByNight.get(night.id) ?? []).filter((r) => r.going).length

        return (
          <button
            key={night.id}
            type="button"
            onClick={() => onSelect(night.scheduled_for)}
            className="flex cursor-pointer items-center gap-3 rounded-lg bg-ink-soft p-3 text-left hover:bg-ink-raised"
          >
            {movies.length > 0 ? (
              <div className="flex shrink-0 gap-1">
                {movies.map((movie) =>
                  movie.poster ? (
                    <img
                      key={movie.id}
                      src={movie.poster}
                      alt=""
                      className="aspect-2/3 w-10 rounded object-cover"
                    />
                  ) : (
                    <div
                      key={movie.id}
                      className="flex aspect-2/3 w-10 items-center justify-center rounded bg-ink-raised text-xs text-neutral-600"
                    >
                      🎬
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="flex aspect-2/3 w-10 shrink-0 items-center justify-center rounded bg-ink-raised text-xs text-neutral-600">
                {movieIds.length ? '…' : ''}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                {formatNightDate(night.scheduled_for)}
                {goingCount > 0 && (
                  <span className="rounded-full bg-green-600/20 px-1.5 text-[10px] font-semibold text-green-400">
                    {goingCount} going
                  </span>
                )}
              </p>
              <p className="truncate text-sm font-medium text-white">
                {movies.length
                  ? movies.map((m) => m.title).join(', ')
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
