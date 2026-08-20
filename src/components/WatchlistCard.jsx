import { avatarSrc } from '@/data/avatars'

/** `entry` is one grouped watchlist entry from groupWatchlist(): { movieId, movie, wantedBy, addedAt }. */
export default function WatchlistCard({ entry }) {
  const { movie, wantedBy } = entry

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-ink-soft">
      <div className="aspect-2/3 w-full overflow-hidden bg-ink-raised">
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
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        <p className="line-clamp-2 text-sm leading-tight font-medium text-white">
          {movie?.title ?? 'Loading…'}
        </p>
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {wantedBy.map((profile) => (
              <img
                key={profile.id}
                src={avatarSrc(profile.avatar)}
                alt=""
                title={profile.name}
                className="size-6 rounded-full border-2 border-ink-soft"
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
