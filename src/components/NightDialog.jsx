import { useEffect, useRef, useState } from 'react'

import CatalogSearchPicker from '@/components/CatalogSearchPicker'
import NightRsvp from '@/components/NightRsvp'
import { isPastDate } from '@/data/dates'
import { scheduleMovieOn } from '@/lib/scheduling'
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

      <div className="border-t border-neutral-800 pt-3">
        <NightRsvp nightId={night.id} />
      </div>

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
  const isPast = isPastDate(iso)

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
    // scheduleMovieOn owns the whole booking: creating the night, attaching the film before
    // notify-night reads it, staying silent for a past date, and closing any open date poll for
    // that film. NightRow's own "+ Add a film" stays a plain addMovieToNight -- attaching to a
    // night that already exists isn't a booking.
    await scheduleMovieOn(iso, movieId, profileId)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="dialog-sheet [--dialog-width:28rem] overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {dateLabel}
            {isPast && (
              <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-xs font-semibold text-green-400">
                Already watched
              </span>
            )}
          </h2>
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
            <span className="text-xs text-neutral-400">
              {isPast
                ? 'Pick the film we watched — it goes straight to Watched, and nobody gets a notification.'
                : 'Pick a film to plan this night'}
            </span>
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
