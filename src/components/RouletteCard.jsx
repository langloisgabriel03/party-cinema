import { avatarSrc, isAdmin } from '@/data/avatars'
import { scoreColor } from '@/data/movieCatalog'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

/** `entry` is one grouped roulette entry from groupWatchlist(): { movieId, movie, wantedBy, addedAt }. */
export default function RouletteCard({ entry }) {
  const { movie, wantedBy } = entry
  const profileId = useAppStore((state) => state.currentProfileId)
  const admin = isAdmin(useCurrentProfile())
  const removeFromRoulette = usePlanStore((state) => state.removeFromRoulette)

  // Only your own pick is yours to pull -- everyone has a limited number of slots, so removing
  // someone else's costs them one they can't see they've lost. The admin profile is exempt (see
  // isAdmin): they can clear anyone's pick, one avatar at a time below.
  const isMine = wantedBy.some((profile) => profile.id === profileId)
  // The big top-right control: your own pick always, or -- for the admin -- the single owner of
  // a card nobody else has also picked. A card multiple people picked has no one obvious owner
  // for this button, so the admin removes those per-person via the avatar row instead.
  const removableOwnerId = isMine ? profileId : admin && wantedBy.length === 1 ? wantedBy[0].id : null

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
        {removableOwnerId != null && (
          <button
            type="button"
            onClick={() => removeFromRoulette(entry.movieId, removableOwnerId)}
            aria-label={`Remove ${movie?.title ?? 'movie'} from the roulette`}
            className="absolute top-1 right-1 flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-sm font-bold text-neutral-200 backdrop-blur-sm hover:bg-black/80"
          >
            ✕
          </button>
        )}
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
          {wantedBy.map((person) =>
            admin ? (
              <button
                key={person.id}
                type="button"
                onClick={() => removeFromRoulette(entry.movieId, person.id)}
                title={`Remove ${person.name}'s pick`}
                aria-label={`Remove ${person.name}'s pick from the roulette`}
                className="size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-ink-soft transition-opacity hover:opacity-50"
              >
                <img src={avatarSrc(person.avatar)} alt="" className="size-full object-cover" />
              </button>
            ) : (
              <img
                key={person.id}
                src={avatarSrc(person.avatar)}
                alt=""
                title={person.name}
                className="size-8 rounded-full border-2 border-ink-soft object-cover"
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
