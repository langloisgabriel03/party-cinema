import { avatarSrc } from '@/data/avatars'
import { formatWatchedDate } from '@/data/dates'
import { scoreColor } from '@/data/movieCatalog'

/**
 * The history shelf: films whose night has already been and gone, newest first.
 *
 * Two compact columns at every width -- history should cost as little vertical space as
 * possible, since the sections above it (next night, what's still to come) are the ones anyone
 * actually acts on. That budget is why the date sits inline under the title rather than in a
 * right-hand stub: at two-up on a phone there is no room for a second column of text.
 * Posters stay desaturated until hover, so the shelf reads as archive at a glance.
 *
 * `entries` are watchedEntries() rows: { movieId, movie, watchedOn, nightId, times, watchedBy }.
 */
export default function WatchedMovies({ entries, onSelect }) {
  return (
    <ol className="grid grid-cols-2 gap-2">
      {entries.map((entry) => {
        const { movie } = entry
        return (
          <li key={entry.movieId}>
            <button
              type="button"
              onClick={() => onSelect(entry.watchedOn)}
              title={movie ? `${movie.title} — watched ${formatWatchedDate(entry.watchedOn)}` : undefined}
              className="group flex h-full w-full cursor-pointer items-center gap-2.5 rounded-lg bg-ink-soft p-2 text-left transition-colors hover:bg-ink-raised"
            >
              <div className="relative w-10 shrink-0">
                {movie?.poster ? (
                  <img
                    src={movie.poster}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-2/3 w-full rounded object-cover saturate-50 transition-all duration-300 group-hover:saturate-100"
                  />
                ) : (
                  <div className="flex aspect-2/3 w-full items-center justify-center rounded bg-ink-raised text-xs text-neutral-600">
                    🎬
                  </div>
                )}
                {/* The tick is the whole point of the row -- keep it on the poster, where the eye
                    lands first, not in the text column that's already fighting for width. */}
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white ring-2 ring-ink"
                >
                  ✓
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs leading-tight font-medium text-white">
                  {movie?.title ?? 'Loading…'}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  <span className="font-semibold text-green-400">
                    {formatWatchedDate(entry.watchedOn)}
                  </span>
                  {movie?.tomatometer != null && (
                    <span className={scoreColor(movie.tomatometer)}> · 🍅 {movie.tomatometer}%</span>
                  )}
                  {entry.times > 1 && <span className="text-neutral-400"> · {entry.times}×</span>}
                </p>
                {entry.watchedBy.length > 0 && (
                  <div className="mt-1 flex -space-x-1.5">
                    {entry.watchedBy.map((profile) => (
                      <img
                        key={profile.id}
                        src={avatarSrc(profile.avatar)}
                        alt=""
                        title={`${profile.name} was there`}
                        className="size-5 rounded-full border border-ink-soft object-cover group-hover:border-ink-raised"
                      />
                    ))}
                  </div>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
