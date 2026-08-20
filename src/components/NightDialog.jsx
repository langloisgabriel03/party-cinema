import { useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

function FilmPicker({ watchlistEntries, onPick }) {
  if (watchlistEntries.length === 0) {
    return (
      <p className="text-xs text-neutral-500">
        Watchlist is empty — add movies from the search page first.
      </p>
    )
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {watchlistEntries.map((entry) => (
        <button
          key={entry.movieId}
          type="button"
          title={entry.movie?.title}
          onClick={() => onPick(entry.movieId)}
          className="w-16 shrink-0 cursor-pointer overflow-hidden rounded"
        >
          {entry.movie?.poster ? (
            <img src={entry.movie.poster} alt="" className="aspect-2/3 w-full object-cover" />
          ) : (
            <div className="flex aspect-2/3 w-full items-center justify-center bg-ink-raised px-1 text-center text-[10px] text-neutral-500">
              {entry.movie?.title ?? '…'}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function NightRow({ night, movieIds, watchlistEntries, moviesById, profileId }) {
  const updateNight = usePlanStore((state) => state.updateNight)
  const deleteNight = usePlanStore((state) => state.deleteNight)
  const addMovieToNight = usePlanStore((state) => state.addMovieToNight)
  const removeMovieFromNight = usePlanStore((state) => state.removeMovieFromNight)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Already-attached films don't need to show again in the "add another" picker.
  const pickableEntries = watchlistEntries.filter((entry) => !movieIds.includes(entry.movieId))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={night.note ?? ''}
          onChange={(e) => updateNight(night.id, { note: e.target.value || null })}
          placeholder="Note (optional)"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
        />
        <button
          type="button"
          onClick={() => deleteNight(night.id)}
          className="shrink-0 cursor-pointer text-xs text-red-400 hover:text-red-300"
        >
          Cancel night
        </button>
      </div>

      {movieIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {movieIds.map((movieId) => {
            const movie = moviesById.get(movieId)
            return (
              <div key={movieId} className="relative w-16 shrink-0">
                {movie?.poster ? (
                  <img src={movie.poster} alt="" className="aspect-2/3 w-full rounded object-cover" />
                ) : (
                  <div className="flex aspect-2/3 w-full items-center justify-center rounded bg-ink-raised px-1 text-center text-[10px] text-neutral-500">
                    {movie?.title ?? '…'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeMovieFromNight(night.id, movieId)}
                  aria-label={`Remove ${movie?.title ?? 'film'}`}
                  className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/80 text-xs text-white hover:bg-red-500"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPickerOpen((open) => !open)}
        className="cursor-pointer self-start text-sm text-brand hover:text-brand-hover"
      >
        + Add a film from the watchlist
      </button>

      {pickerOpen && (
        <FilmPicker
          watchlistEntries={pickableEntries}
          onPick={(movieId) => {
            addMovieToNight(night.id, movieId, profileId)
            setPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default function NightDialog({
  open,
  onClose,
  iso,
  dateLabel,
  nights,
  watchlistEntries,
  moviesById,
  nightMoviesByNight,
}) {
  const dialogRef = useRef(null)
  const profileId = useAppStore((state) => state.currentProfileId)
  const scheduleNight = usePlanStore((state) => state.scheduleNight)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{dateLabel}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {nights.map((night) => (
          <NightRow
            key={night.id}
            night={night}
            movieIds={nightMoviesByNight.get(night.id) ?? []}
            watchlistEntries={watchlistEntries}
            moviesById={moviesById}
            profileId={profileId}
          />
        ))}

        {/* Only one night per date -- once one exists above, there's nothing to "add"; use its
            own "+ Add a film" control instead. Multiple films on one night are how you handle
            "more than one movie in a day" now, not multiple nights on the same date. */}
        {nights.length === 0 && (
          <button
            type="button"
            onClick={() => scheduleNight({ scheduledFor: iso, createdBy: profileId })}
            className="cursor-pointer rounded bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            + Add movie night on this date
          </button>
        )}
      </div>
    </dialog>
  )
}
