import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import MonthCalendar from '@/components/MonthCalendar'
import { formatNightDate, isPastDate } from '@/data/dates'
import { scheduleMovieOn } from '@/lib/scheduling'
import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * Tapping a film on the watchlist asks the one question worth asking about it: when?
 *
 * Two answers, because they're genuinely different situations. If you already know the date,
 * pick it -- that books the night then and there. If you don't, the group does: "ask everyone"
 * opens a date poll that lands above the calendar on everyone's dashboard, where each person
 * marks the evenings they can do (see DatePolls / AvailabilityDialog).
 *
 * Picking a date that's already gone is the third case, and it needs no button of its own -- the
 * calendar allows it and scheduleMovieOn() quietly logs it as watched instead of announcing it.
 */
export default function ScheduleMovieDialog({ open, onClose, movie, movieId }) {
  const dialogRef = useRef(null)
  const profileId = useAppStore((state) => state.currentProfileId)
  const nights = usePlanStore((state) => state.nights)
  const datePolls = usePlanStore((state) => state.datePolls)
  const openDatePoll = usePlanStore((state) => state.openDatePoll)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(null) // null = the two-button chooser | 'calendar'
  const [done, setDone] = useState(null) // an ISO date, or 'poll'

  const polled = datePolls.some((poll) => poll.movie_id === movieId)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Back to the chooser on every open -- reopening a card and landing on the last visit's
  // calendar (or worse, its confirmation) would be a small mystery every time.
  useEffect(() => {
    if (open) {
      setDone(null)
      setMode(null)
    }
  }, [open])

  const nightsByDate = new Map()
  for (const night of nights) {
    nightsByDate.set(night.scheduled_for, (nightsByDate.get(night.scheduled_for) ?? 0) + 1)
  }

  const handlePick = async (iso) => {
    if (busy) return
    setBusy(true)
    try {
      await scheduleMovieOn(iso, movieId, profileId)
      setDone(iso)
    } finally {
      setBusy(false)
    }
  }

  const handleAskEveryone = async () => {
    if (busy) return
    setBusy(true)
    try {
      await openDatePoll(movieId, profileId)
      setDone('poll')
    } finally {
      setBusy(false)
    }
  }

  // Portaled to <body>. This dialog is rendered from a WatchlistCard, which lives in the
  // watchlist's CSS grid -- and a dialog left inside a grid container is laid out as a GRID ITEM,
  // pushed off to whichever cell it came from. Every other dialog in the app is already a direct
  // child of its page root, so only this one needs lifting out.
  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="dialog-sheet [--dialog-width:26rem] overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:rounded-lg sm:border"
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
            {done === 'poll' ? (
              <p className="rounded-lg bg-brand/20 p-3 text-sm text-white">
                🗓️ Asking everyone — it&rsquo;s at the top of the dashboard now, where each person
                taps the evenings they can do.
              </p>
            ) : isPastDate(done) ? (
              <p className="rounded-lg bg-green-600/20 p-3 text-sm text-white">
                ✓ Watched on <span className="font-semibold">{formatNightDate(done)}</span> — moved to
                Watched, no notifications sent.
              </p>
            ) : (
              <p className="rounded-lg bg-brand/20 p-3 text-sm text-white">
                🎬 Booked for <span className="font-semibold">{formatNightDate(done)}</span>
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full cursor-pointer rounded-lg bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Done
            </button>
          </div>
        ) : mode === 'calendar' ? (
          <>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="cursor-pointer self-start text-sm text-neutral-400 hover:text-white"
            >
              ← Back
            </button>
            <p className="text-sm text-neutral-400">
              Pick a date to watch it — or a past one to log a film we already saw.
            </p>
            <MonthCalendar nightsByDate={nightsByDate} onSelectDate={handlePick} />
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setMode('calendar')}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-ink-raised p-4 text-left transition-colors hover:bg-neutral-700"
            >
              <span className="text-2xl" aria-hidden="true">
                📅
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">Pick a date</span>
                <span className="block text-xs text-neutral-400">
                  I know when — book the night now
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleAskEveryone}
              disabled={busy || polled}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-ink-raised p-4 text-left transition-colors hover:bg-neutral-700 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-ink-raised"
            >
              <span className="text-2xl" aria-hidden="true">
                🙋
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">
                  {polled ? 'Already asking everyone' : 'Ask everyone when they can'}
                </span>
                <span className="block text-xs text-neutral-400">
                  {polled
                    ? 'It’s on the dashboard — tap it there to mark your days'
                    : 'Nobody knows yet — let everyone mark their evenings'}
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </dialog>,
    document.body
  )
}
