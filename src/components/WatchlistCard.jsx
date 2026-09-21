import { useState } from 'react'

import MagnetLink from '@/components/MagnetLink'
import ScheduleMovieDialog from '@/components/ScheduleMovieDialog'
import TrailerLink from '@/components/TrailerLink'
import { avatarSrc } from '@/data/avatars'
import { formatCount, scoreColor } from '@/data/movieCatalog'
import { usePlanStore } from '@/store/usePlanStore'

/** `entry` is one grouped watchlist entry from groupWatchlist(): { movieId, movie, wantedBy, addedAt }. */
export default function WatchlistCard({ entry }) {
  const { movie, wantedBy } = entry
  const removeWatchlistMovie = usePlanStore((state) => state.removeWatchlistMovie)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={() => setScheduleOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setScheduleOpen(true)
        }
      }}
      title={movie ? `Schedule a movie night for ${movie.title}` : undefined}
      className="flex cursor-pointer flex-col overflow-hidden rounded-lg bg-ink-soft transition-colors hover:bg-ink-raised"
    >
      <div className="relative aspect-2/3 w-full overflow-hidden bg-ink-raised">
        {movie?.poster ? (
          <img
            src={movie.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-2 text-center text-xs text-neutral-600">
            {movie ? 'No poster' : '…'}
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation() // don't also open the schedule dialog behind it
            removeWatchlistMovie(entry.movieId)
          }}
          aria-label={`Remove ${movie?.title ?? 'movie'} from the watchlist`}
          className="absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-xs sm:size-9 sm:text-sm font-bold text-neutral-200 backdrop-blur-sm hover:bg-black/80"
        >
          ✕
        </button>
        {movie && <TrailerLink title={movie.title} year={movie.year} compact />}
        {movie && <MagnetLink title={movie.title} year={movie.year} compact />}
      </div>
      <div className="flex flex-col gap-1.5 p-1.5 flex-1 sm:p-2">
        <p className="line-clamp-2 text-xs leading-tight sm:text-sm font-medium text-white">
          {movie?.title ?? 'Loading…'}
        </p>

        {movie && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xs font-bold sm:text-sm ${scoreColor(movie.tomatometer)}`}>
                🍅 {movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
              </span>
              {movie.critic_review_count > 0 && (
                <span className="hidden text-xs text-neutral-500 sm:inline">{formatCount(movie.critic_review_count)}</span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xs font-bold sm:text-sm ${scoreColor(movie.audience_score)}`}>
                🍿 {movie.audience_score != null ? `${movie.audience_score}%` : '—'}
              </span>
              {movie.audience_rating_count > 0 && (
                <span className="hidden text-xs text-neutral-500 sm:inline">{formatCount(movie.audience_rating_count)}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center mt-auto">
          <div className="flex -space-x-1.5 sm:-space-x-2.5">
            {wantedBy.map((profile) => (
              <img
                key={profile.id}
                src={avatarSrc(profile.avatar)}
                alt=""
                title={profile.name}
                className="size-6 rounded-full border-2 border-ink-soft object-cover sm:size-10"
              />
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Sibling of the card, not a child: nested inside, the dialog's own clicks would bubble
        back up to the card's onClick and immediately reopen it. */}
    {scheduleOpen && (
      <ScheduleMovieDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        movie={movie}
        movieId={entry.movieId}
      />
    )}
    </>
  )
}
