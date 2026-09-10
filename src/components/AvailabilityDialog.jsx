import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { avatarSrc } from '@/data/avatars'
import { dayOfMonth, formatNightDate, nextDates, weekdayLabel } from '@/data/dates'
import { summarizePoll } from '@/data/plan'
import { scheduleMovieOn } from '@/lib/scheduling'
import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

// Three weeks of evenings. Long enough that there's almost always a day everyone can do, short
// enough to stay a wall of taps rather than a scroll -- and it rolls forward on its own, so a
// poll left open for a fortnight is still offering days that haven't happened yet.
const POLL_DAYS = 21

// Stable identity: `?? []` would hand useMemo a fresh array on every render and recompute the
// tally on every unrelated store update.
const NO_ROWS = []

/**
 * "When can you watch this?" -- one film, everyone's evenings, one tap per day.
 *
 * A day is either yours or it isn't: the row IS the yes, so there's no maybe to represent and
 * tapping again takes it back. The tally under each day is everyone else's answer, which turns
 * the grid into the answer to the actual question -- which evening works for the most people --
 * without anyone having to read a table.
 */
export default function AvailabilityDialog({ open, onClose, movie, movieId }) {
  const dialogRef = useRef(null)
  const profileId = useAppStore((state) => state.currentProfileId)
  const profiles = useAppStore((state) => state.profiles)
  const availabilityByMovie = usePlanStore((state) => state.availabilityByMovie)
  const toggleAvailability = usePlanStore((state) => state.toggleAvailability)
  const closeDatePoll = usePlanStore((state) => state.closeDatePoll)
  const [busy, setBusy] = useState(false)
  const [booked, setBooked] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (open) setBooked(null)
  }, [open])

  // Recomputed from today on every open rather than frozen when the poll was created: a poll that
  // sat for a week should be offering next week's evenings, not last week's.
  const dates = useMemo(() => nextDates(POLL_DAYS), [open])

  const rows = availabilityByMovie.get(movieId) ?? NO_ROWS
  const { byDate, best, topCount, mine, responders } = useMemo(
    () => summarizePoll({ rows, dates, profiles, profileId }),
    [rows, dates, profiles, profileId]
  )

  const handleBook = async (iso) => {
    if (busy) return
    setBusy(true)
    try {
      // scheduleMovieOn closes the poll itself: the question has been answered, so it stops
      // being asked wherever it was answered from. Availability goes with it (see
      // date_poll_schema.sql for why answers must not outlive their poll).
      await scheduleMovieOn(iso, movieId, profileId)
      setBooked(iso)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="dialog-sheet [--dialog-width:30rem] overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {movie?.poster && (
              <img src={movie.poster} alt="" className="aspect-2/3 w-12 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-xs tracking-wide text-neutral-400 uppercase">When can you watch…</p>
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

        {booked ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-brand/20 p-3 text-sm text-white">
              🎬 Booked for <span className="font-semibold">{formatNightDate(booked)}</span> — the
              poll is closed and everyone&rsquo;s been told.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full cursor-pointer rounded-lg bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              Tap every evening you could do — tap again to take one back.
              {responders.length > 0 && (
                <span className="text-neutral-500">
                  {' '}
                  {responders.length} of {profiles.length} answered.
                </span>
              )}
            </p>

            {/*
              Each day's own colour depends only on that day's own respondents -- never on how it
              compares to any other day. That used to double as the "currently winning" signal
              (a ring on whichever day(s) were tied for most), which meant marking your own day
              could visibly strip the ring off a DIFFERENT day the instant it fell out of the
              lead -- a day someone had genuinely told you they were free on, going from "green"
              to plain the moment a rival day pulled ahead. Confusing to watch happen, and not
              actually useful: "who's winning" already has its own answer below (Best so far),
              with the tie-break buttons to act on it. A day chip only ever needs to say "is
              anyone free" and "am I", and neither changes when a different day gets more votes.
            */}
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {dates.map((iso) => {
                const people = byDate.get(iso) ?? []
                const isMine = mine.has(iso)
                const hasAnyone = people.length > 0
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggleAvailability(movieId, profileId, iso)}
                    aria-pressed={isMine}
                    title={
                      people.length
                        ? `${formatNightDate(iso)} — ${people.map((p) => p.name).join(', ')}`
                        : formatNightDate(iso)
                    }
                    className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors ${
                      isMine
                        ? 'border-2 border-green-500 bg-green-600/25 text-white'
                        : hasAnyone
                          ? 'border border-green-600 bg-ink-raised text-neutral-200 hover:border-green-500'
                          : 'border border-neutral-800 bg-ink-raised text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    <span className="text-[10px] tracking-wide text-neutral-400 uppercase">
                      {weekdayLabel(iso)}
                    </span>
                    <span className="text-sm leading-none font-semibold">{dayOfMonth(iso)}</span>
                    {/* A fixed-height slot either way, so marking a day doesn't reflow the grid. */}
                    <span className="flex h-4 items-center">
                      {hasAnyone ? (
                        <span className="flex -space-x-1.5">
                          {people.slice(0, 4).map((person) => (
                            <img
                              key={person.id}
                              src={avatarSrc(person.avatar)}
                              alt=""
                              title={person.name}
                              className="size-4 rounded-full border border-ink-soft object-cover"
                            />
                          ))}
                          {people.length > 4 && (
                            <span className="flex size-4 items-center justify-center rounded-full border border-ink-soft bg-ink-raised text-[7px] font-semibold text-neutral-300">
                              +{people.length - 4}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-700">—</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {topCount > 0 ? (
              <div className="flex flex-col gap-2 rounded-lg bg-ink-raised p-3">
                <p className="text-xs text-neutral-400">
                  Best so far: <span className="font-semibold text-green-400">{topCount} can make it</span>
                </p>
                {/* One button per tied day rather than picking a winner for them -- with two
                    equal days the choice is human (school night, someone's birthday), not ours. */}
                <div className="flex flex-wrap gap-2">
                  {best.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => handleBook(iso)}
                      disabled={busy}
                      className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                    >
                      🎬 Book {formatNightDate(iso)}
                      <span className="flex -space-x-2">
                        {(byDate.get(iso) ?? []).map((profile) => (
                          <img
                            key={profile.id}
                            src={avatarSrc(profile.avatar)}
                            alt=""
                            title={profile.name}
                            className="size-5 rounded-full border border-brand object-cover"
                          />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-ink-raised p-3 text-xs text-neutral-500">
                Nobody&rsquo;s marked a day yet. Once someone has, the best evening turns up here with
                a button to book it.
              </p>
            )}

            <button
              type="button"
              onClick={async () => {
                await closeDatePoll(movieId)
                onClose()
              }}
              className="cursor-pointer self-start text-xs text-neutral-500 hover:text-red-400"
            >
              Stop asking about this film
            </button>
          </>
        )}
      </div>
    </dialog>,
    document.body
  )
}
