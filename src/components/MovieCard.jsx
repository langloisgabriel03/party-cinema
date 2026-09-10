import { memo, useState } from 'react'

import MagnetLink from '@/components/MagnetLink'
import TrailerLink from '@/components/TrailerLink'
import WatchlistButton from '@/components/WatchlistButton'
import filterSchema from '@/data/filterSchema.json'
import { formatCount, scoreColor } from '@/data/movieCatalog'
import { movieReferences } from '@/data/plan'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * The admin-only delete row -- a separate component (not inlined in MovieCard) so its own local
 * state (confirming/busy/error) doesn't force MovieCard itself to re-render, and so a non-admin
 * viewer's cards carry zero extra state at all. A card row rather than a poster-corner icon: the
 * poster's four corners are already spoken for (WatchlistButton, TrailerLink, MagnetLink, list
 * badges), and confirming a permanent, cascading delete deserves the room to say what's at stake
 * rather than a cramped icon-on-icon tooltip.
 */
function DeleteRow({ movieId, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [references, setReferences] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          // Read live, at the moment of the click, not as a subscription -- this component
          // mounts on every card the admin can see, and none of them need to re-render every
          // time someone anywhere adds a roulette pick.
          const { watchlist, nightMovies, rouletteEntries, datePolls } = usePlanStore.getState()
          setReferences(movieReferences(movieId, { watchlist, nightMovies, rouletteEntries, datePolls }))
          setConfirming(true)
        }}
        className="flex w-full cursor-pointer items-center gap-1 border-t border-neutral-800 px-2 py-1.5 text-[10px] text-neutral-600 transition-colors hover:border-red-900 hover:text-red-400"
      >
        🗑️ Remove from catalog
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1 border-t border-red-900/50 bg-red-950/20 px-2 py-1.5">
      <p className="text-[10px] leading-tight text-red-300">
        {references.length > 0
          ? `Also removes it from ${references.join(', ')}.`
          : 'This cannot be undone.'}
      </p>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = await onDelete(movieId)
            // On success the card unmounts (the movie leaves the grid upstream) -- only a
            // failure ever gets seen here, so there's no success state to render.
            if (result?.error) {
              setError(result.error)
              setBusy(false)
            }
          }}
          className="flex-1 cursor-pointer rounded bg-red-900/60 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-800 disabled:cursor-default disabled:opacity-60"
        >
          {busy ? 'Removing…' : '🗑️ Confirm'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="cursor-pointer rounded border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:border-neutral-500"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function MovieCard({ movie, admin, onDelete }) {
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
        <MagnetLink title={movie.title} year={movie.year} />
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

      {/* Admin-only, and only ever this one extra row -- every card gets it uniformly (not just
          the one being hovered), so a grid row's auto-height stays consistent across siblings. */}
      {admin && <DeleteRow movieId={movie.id} onDelete={onDelete} />}
    </div>
  )
}

export default memo(MovieCard)
