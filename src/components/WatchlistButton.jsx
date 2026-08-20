import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * Deliberately takes only `movieId`, not `inWatchlist`/`onToggle` from the parent: MovieCard
 * renders up to 30 of these per page over a 5,851-row catalog and is memo()'d specifically to
 * survive that. An inline `() => toggle(movie.id)` handed down as a prop would be a fresh
 * function on every keystroke, defeating the memo. Self-subscribing means MovieCard's props
 * never change -- a watchlist edit re-renders 30 tiny buttons, not 30 full cards.
 */
export default function WatchlistButton({ movieId }) {
  const profileId = useAppStore((state) => state.currentProfileId)
  // Both selectors return primitives, so Zustand's default Object.is comparison is correct here
  // without useShallow.
  const wanted = usePlanStore(
    (state) => state.watchlistByMovie.get(movieId)?.includes(profileId) ?? false
  )
  const count = usePlanStore((state) => state.watchlistByMovie.get(movieId)?.length ?? 0)
  const toggle = usePlanStore((state) => state.toggleWatchlist) // store actions are stable forever

  if (!profileId) return null

  return (
    <button
      type="button"
      aria-pressed={wanted}
      aria-label={wanted ? 'Remove from watchlist' : 'Add to watchlist'}
      onClick={(event) => {
        event.stopPropagation()
        toggle(movieId, profileId)
      }}
      className={`absolute top-1 right-1 flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full text-sm font-bold backdrop-blur-sm ${
        wanted ? 'bg-brand text-white' : 'bg-black/60 text-neutral-200 hover:bg-black/80'
      }`}
    >
      {wanted ? '✓' : '+'}
      {count > 1 && <span className="ml-0.5 text-xs">{count}</span>}
    </button>
  )
}
