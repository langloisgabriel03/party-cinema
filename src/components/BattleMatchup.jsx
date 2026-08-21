import { avatarSrc } from '@/data/avatars'
import { scoreColor } from '@/data/movieCatalog'

function Fighter({ movie, votes, voters, selected, onPick, side }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group relative flex-1 overflow-hidden rounded-xl border-2 text-left transition-all ${
        selected
          ? 'border-brand shadow-[0_0_24px_-4px_var(--color-brand)]'
          : 'border-neutral-800 hover:border-neutral-600'
      }`}
    >
      <div className="relative aspect-2/3 w-full overflow-hidden bg-ink-raised">
        {movie?.poster ? (
          <img
            src={movie.poster}
            alt=""
            className={`size-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              selected ? '' : 'opacity-90'
            }`}
          />
        ) : (
          <div className="flex size-full items-center justify-center px-2 text-center text-xs text-neutral-500">
            {movie?.title ?? '…'}
          </div>
        )}
        {/* Bottom fade so the title stays readable over a busy poster. */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/95 to-transparent" />

        {selected && (
          <div
            className={`absolute top-2 ${side === 'left' ? 'left-2' : 'right-2'} rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase`}
          >
            Your pick
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2">
          <p className="line-clamp-2 text-sm leading-tight font-bold text-white drop-shadow">
            {movie?.title ?? 'Loading…'}
          </p>
          {movie && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
              <span className={scoreColor(movie.tomatometer)}>
                🍅{movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
              </span>
              <span className={scoreColor(movie.audience_score)}>
                🍿{movie.audience_score != null ? `${movie.audience_score}%` : '—'}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-ink-soft px-2 py-2">
        <span className="text-xl leading-none font-black text-white tabular-nums">{votes}</span>
        <div className="flex -space-x-2">
          {voters.map((profile) => (
            <img
              key={profile.id}
              src={avatarSrc(profile.avatar)}
              alt=""
              title={profile.name}
              className="size-6 rounded-full border-2 border-ink-soft object-cover"
            />
          ))}
        </div>
      </div>
    </button>
  )
}

/**
 * The head-to-head everyone is voting on right now, deliberately loud: big posters, a struck VS
 * badge between them, and a bar showing which way the room is leaning. The full tree below is for
 * context -- this is the thing you're meant to act on.
 */
export default function BattleMatchup({
  match,
  moviesById,
  countA,
  countB,
  votersA,
  votersB,
  myVote,
  onVote,
  roundLabel,
  voterCount,
}) {
  const cast = countA + countB
  // 50/50 before anyone votes, so the bar starts balanced rather than empty.
  const pctA = cast === 0 ? 50 : (countA / cast) * 100

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-brand uppercase">{roundLabel}</h2>
        <span className="text-xs text-neutral-500">
          {cast}/{voterCount} voted
        </span>
      </div>

      <div className="relative flex items-start gap-2 sm:gap-4">
        <Fighter
          movie={moviesById.get(match.movie_a)}
          votes={countA}
          voters={votersA}
          selected={myVote === match.movie_a}
          onPick={() => onVote(match.movie_a)}
          side="left"
        />

        {/* Centred over the gap, out of flow so both posters stay equal width. */}
        <div className="pointer-events-none absolute top-1/3 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="flex size-12 rotate-12 items-center justify-center rounded-full border-2 border-white bg-ink shadow-[0_0_20px_rgba(0,0,0,0.9)] sm:size-14">
            <span className="text-base font-black tracking-tight text-white italic sm:text-lg">VS</span>
          </div>
        </div>

        <Fighter
          movie={moviesById.get(match.movie_b)}
          votes={countB}
          voters={votersB}
          selected={myVote === match.movie_b}
          onPick={() => onVote(match.movie_b)}
          side="right"
        />
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-ink-raised">
        <div className="bg-brand transition-all duration-500" style={{ width: `${pctA}%` }} />
        <div className="flex-1 bg-neutral-600 transition-all duration-500" />
      </div>
    </section>
  )
}
