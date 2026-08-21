import { useEffect, useRef, useState } from 'react'

import CatalogSearchPicker from '@/components/CatalogSearchPicker'
import { notifyNightBooked } from '@/lib/push'
import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

function NightRow({ night, movieIds, moviesById, profileId, watchlistEntries, onClose }) {
  const deleteNight = usePlanStore((state) => state.deleteNight)
  const addMovieToNight = usePlanStore((state) => state.addMovieToNight)
  const removeMovieFromNight = usePlanStore((state) => state.removeMovieFromNight)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => deleteNight(night.id)}
          className="cursor-pointer text-xs text-red-400 hover:text-red-300"
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
        + Add a film
      </button>

      {pickerOpen && (
        <CatalogSearchPicker
          excludeIds={movieIds}
          watchlistEntries={watchlistEntries}
          onPick={(movieId) => {
            addMovieToNight(night.id, movieId, profileId)
            // Picking a film is the whole point of opening the dialog -- close it rather than
            // leaving the confirmation view up for the user to dismiss themselves.
            onClose()
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
  moviesById,
  nightMoviesByNight,
  watchlistEntries,
}) {
  const dialogRef = useRef(null)
  const profileId = useAppStore((state) => state.currentProfileId)
  const scheduleNight = usePlanStore((state) => state.scheduleNight)
  const addMovieToNight = usePlanStore((state) => state.addMovieToNight)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Straight to film search for a fresh date -- no intermediate "add a night" step. Picking a
  // result creates the night, attaches the film, and closes the dialog in one action -- the
  // choice is done, no confirmation view to linger on.
  const handlePickForNewNight = async (movieId) => {
    const night = await scheduleNight({ scheduledFor: iso, createdBy: profileId })
    if (night) {
      // Awaited here (unlike NightRow's fire-and-forget addMovieToNight, which attaches a film
      // to an *existing* night -- not a notify event): notify-night reads night_movies to name
      // the film, so that row has to exist before it's invoked, or the notification goes out as
      // a bare date with no title.
      await addMovieToNight(night.id, movieId, profileId)
      notifyNightBooked(night.id)
    }
    onClose()
  }

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
            moviesById={moviesById}
            profileId={profileId}
            watchlistEntries={watchlistEntries}
            onClose={onClose}
          />
        ))}

        {/* Only one night per date -- once one exists above, use its own "+ Add a film" instead.
            For a fresh date, skip straight to search rather than an intermediate "add a night"
            button: picking a result both books the date and attaches the film. */}
        {nights.length === 0 && (
          <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
            <span className="text-xs text-neutral-400">Pick a film to plan this night</span>
            <CatalogSearchPicker
              excludeIds={[]}
              watchlistEntries={watchlistEntries}
              onPick={handlePickForNewNight}
            />
          </div>
        )}
      </div>
    </dialog>
  )
}
