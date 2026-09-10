import { useMemo, useState } from 'react'

import AvailabilityDialog from '@/components/AvailabilityDialog'
import { avatarSrc } from '@/data/avatars'
import { formatNightDate, nextDates } from '@/data/dates'
import { summarizePoll } from '@/data/plan'
import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

// Must match AvailabilityDialog's window, or the card would advertise a best day the dialog no
// longer offers.
const POLL_DAYS = 21

// See AvailabilityDialog: a fresh `[]` per render would recompute every card's tally on every
// unrelated store update.
const NO_ROWS = []

function PollCard({ poll, onOpen }) {
  const profiles = useAppStore((state) => state.profiles)
  const profileId = useAppStore((state) => state.currentProfileId)
  const availabilityByMovie = usePlanStore((state) => state.availabilityByMovie)

  const rows = availabilityByMovie.get(poll.movieId) ?? NO_ROWS
  const dates = useMemo(() => nextDates(POLL_DAYS), [])
  const { best, topCount, mine, responders } = useMemo(
    () => summarizePoll({ rows, dates, profiles, profileId }),
    [rows, dates, profiles, profileId]
  )

  const answered = mine.size > 0

  return (
    <button
      type="button"
      onClick={() => onOpen(poll)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-neutral-800 bg-ink-soft p-3 text-left transition-colors hover:border-neutral-600 hover:bg-ink-raised"
    >
      {poll.movie?.poster ? (
        <img
          src={poll.movie.poster}
          alt=""
          className="aspect-2/3 w-11 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex aspect-2/3 w-11 shrink-0 items-center justify-center rounded bg-ink-raised text-xs text-neutral-600">
          🎬
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {poll.movie?.title ?? 'Loading…'}
        </p>
        <p className="truncate text-xs text-neutral-400">
          {topCount > 0 ? (
            <>
              Best: <span className="font-semibold text-green-400">{formatNightDate(best[0])}</span>
              {best.length > 1 && <span className="text-neutral-500"> +{best.length - 1} tied</span>}
              <span className="text-neutral-500"> · {topCount} can</span>
            </>
          ) : (
            <span className="text-neutral-500">No days marked yet</span>
          )}
        </p>
        {responders.length > 0 && (
          <div className="mt-1 flex -space-x-2">
            {responders.map((profile) => (
              <img
                key={profile.id}
                src={avatarSrc(profile.avatar)}
                alt=""
                title={`${profile.name} answered`}
                className="size-5 rounded-full border border-ink-soft object-cover"
              />
            ))}
          </div>
        )}
      </div>

      {/* The one thing this card is for: telling you whether the group is still waiting on YOU. */}
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          answered ? 'bg-green-600/20 text-green-400' : 'animate-nudge bg-brand text-white'
        }`}
      >
        {answered ? `You: ${mine.size}` : 'Add yours'}
      </span>
    </button>
  )
}

/**
 * The "when can everyone do this?" strip, directly under the next-night hero.
 *
 * Sits above the calendar because an open poll is a question aimed at the person looking at the
 * screen -- it wants answering now, unlike the calendar, which is there whenever you want it.
 * Renders nothing at all when no poll is open, so the dashboard is unchanged for anyone not
 * using the feature.
 */
export default function DatePolls({ polls }) {
  // Holds the poll object, not its id looked back up from `polls`: booking from the dialog
  // closes the poll, which would take the row out of that list and rip the dialog out from
  // under its own "Booked for Fri 12" confirmation. Keeping the object lets the dialog outlive
  // the question it was asking, and it closes itself when the user is done reading.
  const [selected, setSelected] = useState(null)

  if (polls.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
        🗓️ Finding a date
      </h2>
      {polls.map((poll) => (
        <PollCard key={poll.movieId} poll={poll} onOpen={setSelected} />
      ))}

      {selected && (
        <AvailabilityDialog
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          movie={selected.movie}
          movieId={selected.movieId}
        />
      )}
    </section>
  )
}
