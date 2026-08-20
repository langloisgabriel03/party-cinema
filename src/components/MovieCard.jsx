import { memo } from 'react'

import filterSchema from '@/data/filterSchema.json'

function scoreColor(score) {
  if (score == null) return 'text-neutral-500'
  if (score >= 70) return 'text-green-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

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
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-sm leading-tight font-medium text-white">{movie.title}</p>
        <p className="text-xs text-neutral-500">
          {movie.year}
          {movie.runtime_minutes ? ` · ${movie.runtime_minutes} min` : ''}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-1 text-xs font-semibold">
          <span className={scoreColor(movie.tomatometer)}>🍅 {movie.tomatometer ?? '—'}</span>
          <span className={scoreColor(movie.audience_score)}>🍿 {movie.audience_score ?? '—'}</span>
        </div>
      </div>
    </div>
  )
}

export default memo(MovieCard)
