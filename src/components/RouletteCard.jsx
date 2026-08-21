import { avatarSrc } from '@/data/avatars'
import { scoreColor } from '@/data/movieCatalog'
import { usePlanStore } from '@/store/usePlanStore'

/** `entry` is one grouped roulette entry from groupWatchlist(): { movieId, movie, wantedBy, addedAt }. */
export default function RouletteCard({ entry, highlighted }) {
  const { movie, wantedBy } = entry
  const removeFromRoulette = usePlanStore((state) => state.removeFromRoulette)

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg bg-ink-soft transition-shadow ${
        highlighted ? 'ring-4 ring-brand' : ''
      }`}
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
          onClick={() => removeFromRoulette(entry.movieId)}
          aria-label={`Remove ${movie?.title ?? 'movie'} from the roulette`}
          className="absolute top-1 right-1 flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-sm font-bold text-neutral-200 backdrop-blur-sm hover:bg-black/80"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <p className="line-clamp-2 text-sm leading-tight font-medium text-white">
          {movie?.title ?? 'Loading…'}
        </p>

        {movie && (
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm font-bold ${scoreColor(movie.tomatometer)}`}>
              🍅 {movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
            </span>
            <span className={`text-sm font-bold ${scoreColor(movie.audience_score)}`}>
              🍿 {movie.audience_score != null ? `${movie.audience_score}%` : '—'}
            </span>
          </div>
        )}

        <div className="mt-auto flex -space-x-2.5">
          {wantedBy.map((profile) => (
            <img
              key={profile.id}
              src={avatarSrc(profile.avatar)}
              alt=""
              title={profile.name}
              className="size-8 rounded-full border-2 border-ink-soft object-cover"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
