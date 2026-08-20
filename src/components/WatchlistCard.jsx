import { avatarSrc } from '@/data/avatars'
import { formatCount, scoreColor } from '@/data/movieCatalog'
import { usePlanStore } from '@/store/usePlanStore'

/** `entry` is one grouped watchlist entry from groupWatchlist(): { movieId, movie, wantedBy, addedAt }. */
export default function WatchlistCard({ entry }) {
  const { movie, wantedBy } = entry
  const removeWatchlistMovie = usePlanStore((state) => state.removeWatchlistMovie)

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-ink-soft">
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
          onClick={() => removeWatchlistMovie(entry.movieId)}
          aria-label={`Remove ${movie?.title ?? 'movie'} from the watchlist`}
          className="absolute top-1 right-1 flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-sm font-bold text-neutral-200 backdrop-blur-sm hover:bg-black/80"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        <p className="line-clamp-2 text-sm leading-tight font-medium text-white">
          {movie?.title ?? 'Loading…'}
        </p>

        {movie && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-sm font-bold ${scoreColor(movie.tomatometer)}`}>
                🍅 {movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
              </span>
              {movie.critic_review_count > 0 && (
                <span className="text-xs text-neutral-500">{formatCount(movie.critic_review_count)}</span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-sm font-bold ${scoreColor(movie.audience_score)}`}>
                🍿 {movie.audience_score != null ? `${movie.audience_score}%` : '—'}
              </span>
              {movie.audience_rating_count > 0 && (
                <span className="text-xs text-neutral-500">{formatCount(movie.audience_rating_count)}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center">
          <div className="flex -space-x-2.5">
            {wantedBy.map((profile) => (
              <img
                key={profile.id}
                src={avatarSrc(profile.avatar)}
                alt=""
                title={profile.name}
                className="size-10 rounded-full border-2 border-ink-soft object-cover"
              />
            ))}
          </div>
          {wantedBy.length > 0 && (
            <span className="pl-2 text-xs text-neutral-500">
              {wantedBy.length} want{wantedBy.length === 1 ? 's' : ''} this
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
