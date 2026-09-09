import { avatarSrc } from '@/data/avatars'
import { formatWatchedDate } from '@/data/dates'
import { scoreColor } from '@/data/movieCatalog'

/**
 * The history shelf: films whose night has already been and gone, newest first.
 *
 * Deliberately a row list rather than the poster grid "Soon to watch" uses -- these are records,
 * not choices, and a row has space for the thing that makes a record worth keeping (when we
 * watched it, who was there) without competing for attention with the films still to come.
 * Posters sit desaturated until hover, so the shelf reads as archive at a glance.
 *
 * `entries` are watchedEntries() rows: { movieId, movie, watchedOn, nightId, times, watchedBy }.
 */
export default function WatchedMovies({ entries, onSelect }) {
  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => {
        const { movie } = entry
        return (
          <li key={entry.movieId}>
            <button
              type="button"
              onClick={() => onSelect(entry.watchedOn)}
              title={movie ? `${movie.title} — watched ${formatWatchedDate(entry.watchedOn)}` : undefined}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-lg bg-ink-soft p-2.5 text-left transition-colors hover:bg-ink-raised"
            >
              <div className="relative w-11 shrink-0">
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
                    lands first, not in the text column with everything else. */}
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white ring-2 ring-ink"
                >
                  ✓
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {movie?.title ?? 'Loading…'}
                </p>
                <p className="flex items-center gap-2 text-xs text-neutral-500">
                  {movie?.year && <span>{movie.year}</span>}
                  {movie?.tomatometer != null && (
                    <span className={scoreColor(movie.tomatometer)}>🍅 {movie.tomatometer}%</span>
                  )}
                  {entry.times > 1 && (
                    <span className="text-neutral-400">Seen {entry.times}×</span>
                  )}
                </p>
                {entry.watchedBy.length > 0 && (
                  <div className="mt-1 flex -space-x-2">
                    {entry.watchedBy.map((profile) => (
                      <img
                        key={profile.id}
                        src={avatarSrc(profile.avatar)}
                        alt=""
                        title={`${profile.name} was there`}
                        className="size-6 rounded-full border-2 border-ink-soft object-cover group-hover:border-ink-raised"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Ticket-stub date: the one piece of information this list exists to show. */}
              <span className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-center text-[11px] leading-tight font-semibold tracking-wide text-neutral-300 uppercase transition-colors group-hover:border-neutral-500 group-hover:text-white">
                {formatWatchedDate(entry.watchedOn)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
