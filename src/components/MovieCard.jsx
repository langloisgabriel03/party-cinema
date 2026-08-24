import { memo } from 'react'

import TrailerLink from '@/components/TrailerLink'
import WatchlistButton from '@/components/WatchlistButton'
import filterSchema from '@/data/filterSchema.json'
import { formatCount, scoreColor } from '@/data/movieCatalog'

function MovieCard({ movie }) {
  const listBadges = movie.lists.map((key) => filterSchema.list_labels[key]).filter(Boolean)

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-ink-soft">
      <div className="relative aspect-2/3 w-full overflow-hidden bg-ink-raised">
        {movie.poster ? (
          <img
            src={movie.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-2 text-center text-xs text-neutral-600">
            No poster
          </div>
        )}
        {listBadges.length > 0 && (
          <div className="absolute left-1 top-1 flex gap-0.5">
            {listBadges.slice(0, 3).map((badge, i) => (
              <span
                key={i}
                title={badge.label}
                className="flex size-5 items-center justify-center rounded bg-black/60 text-xs"
              >
                {badge.icon}
              </span>
            ))}
          </div>
        )}
        <WatchlistButton movieId={movie.id} />
        <TrailerLink title={movie.title} year={movie.year} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-sm leading-tight font-medium text-white">{movie.title}</p>
        <p className="text-xs text-neutral-500">
          {movie.year}
          {movie.runtime_minutes ? ` · ${movie.runtime_minutes} min` : ''}
        </p>
        <div className="mt-auto flex flex-col gap-0.5 pt-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-base font-bold sm:text-lg ${scoreColor(movie.tomatometer)}`}>
              🍅 {movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
            </span>
            {movie.critic_review_count > 0 && (
              <span className="text-xs text-neutral-500">{formatCount(movie.critic_review_count)}</span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-base font-bold sm:text-lg ${scoreColor(movie.audience_score)}`}>
              🍿 {movie.audience_score != null ? `${movie.audience_score}%` : '—'}
            </span>
            {movie.audience_rating_count > 0 && (
              <span className="text-xs text-neutral-500">{formatCount(movie.audience_rating_count)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(MovieCard)
