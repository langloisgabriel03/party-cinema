import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import MonthCalendar from '@/components/MonthCalendar'
import { formatNightDate } from '@/data/dates'
import { notifyNightBooked } from '@/lib/push'
import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * "Watch this on…" -- pick a date straight from a watchlist card, rather than going to the
 * calendar and searching the film up again. Attaches to an existing night on that date if there
 * already is one (the app's one-night-per-date convention), otherwise books a new one.
 */
export default function ScheduleMovieDialog({ open, onClose, movie, movieId }) {
  const dialogRef = useRef(null)
  const profileId = useAppStore((state) => state.currentProfileId)
  const nights = usePlanStore((state) => state.nights)
  const nightMoviesByNight = usePlanStore((state) => state.nightMoviesByNight)
  const scheduleNight = usePlanStore((state) => state.scheduleNight)
  const addMovieToNight = usePlanStore((state) => state.addMovieToNight)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (open) setDone(null)
  }, [open])

  const nightsByDate = new Map()
  for (const night of nights) {
    nightsByDate.set(night.scheduled_for, (nightsByDate.get(night.scheduled_for) ?? 0) + 1)
  }

  const handlePick = async (iso) => {
    if (busy) return
    setBusy(true)
    try {
      const existing = nights.find((n) => n.scheduled_for === iso)
      if (existing) {
        // Already on that night -- nothing to do, and no notification: attaching a film to an
        // existing night isn't a "night was booked" event (same rule as NightDialog's NightRow).
        if (!(nightMoviesByNight.get(existing.id) ?? []).includes(movieId)) {
          await addMovieToNight(existing.id, movieId, profileId)
        }
      } else {
        const night = await scheduleNight({ scheduledFor: iso, createdBy: profileId })
        if (night) {
          // Awaited before notifying: notify-night reads night_movies to name the film, so the
          // row has to exist first or the push goes out as a bare date.
          await addMovieToNight(night.id, movieId, profileId)
          notifyNightBooked(night.id)
        }
      }
      setDone(iso)
    } finally {
      setBusy(false)
    }
  }

  // Portaled to <body>. This dialog is rendered from a WatchlistCard, which lives in the
  // watchlist's CSS grid -- and at sm+ the shared dialog styling switches to `position: static`,
  // which would lay it out as a GRID ITEM (pushed off to whichever cell it came from) instead of
  // centred. Every other dialog in the app is already a direct child of its page root, so only
  // this one needs lifting out.
  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(26rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {movie?.poster && (
              <img src={movie.poster} alt="" className="aspect-2/3 w-12 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-xs tracking-wide text-neutral-400 uppercase">Watch this on…</p>
              <p className="truncate text-lg font-semibold">{movie?.title ?? 'Loading…'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-brand/20 p-3 text-sm text-white">
              🎬 Booked for <span className="font-semibold">{formatNightDate(done)}</span>
            </p>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">Pick a date to watch it.</p>
            <MonthCalendar nightsByDate={nightsByDate} onSelectDate={handlePick} />
          </>
        )}
      </div>
    </dialog>,
    document.body
  )
}
