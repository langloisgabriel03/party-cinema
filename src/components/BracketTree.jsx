import { matchesByRound, roundName } from '@/data/bracket'

// Fixed geometry, because a real bracket's lines only line up if every slot's position is
// computable: a round-N match has to sit exactly halfway between the two matches feeding it, and
// that can't be expressed with flex spacing once the rounds have different match counts.
const CARD_W = 158
const ROW_H = 30
const CARD_H = ROW_H * 2
const ROW_GAP = 14
const SLOT_H = CARD_H + ROW_GAP // vertical pitch of round 1
const COL_GAP = 42

/** Centre-Y of the match in `round` (1-indexed) at `slot` (0-indexed). */
function centerY(round, slot) {
  return SLOT_H * 2 ** (round - 1) * (slot + 0.5)
}

function colX(round) {
  return (round - 1) * (CARD_W + COL_GAP)
}

function Side({ movieId, match, moviesById, isTop }) {
  const movie = movieId ? moviesById.get(movieId) : null
  const decided = Boolean(match.winner)
  const won = decided && match.winner === movieId
  const lost = decided && !won

  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 ${isTop ? 'border-b border-neutral-800' : ''} ${
        won ? 'bg-brand/15' : ''
      }`}
      style={{ height: ROW_H }}
    >
      {movie?.poster ? (
        <img
          src={movie.poster}
          alt=""
          loading="lazy"
          className={`h-5 w-3.5 shrink-0 rounded-[2px] object-cover ${lost ? 'opacity-40' : ''}`}
        />
      ) : (
        <div className="h-5 w-3.5 shrink-0 rounded-[2px] bg-ink-raised" />
      )}
      <span
        className={`truncate text-[11px] leading-tight ${
          won ? 'font-semibold text-brand' : lost ? 'text-neutral-600 line-through' : 'text-neutral-300'
        }`}
        title={movie?.title ?? undefined}
      >
        {movieId ? (movie?.title ?? '…') : 'TBD'}
      </span>
    </div>
  )
}

export default function BracketTree({ matches, moviesById, activeMatchId }) {
  const rounds = matchesByRound(matches)
  if (!rounds.length) return null

  const totalRounds = rounds[rounds.length - 1][0]
  const firstRoundCount = rounds[0][1].length
  const height = SLOT_H * firstRoundCount
  const width = colX(totalRounds) + CARD_W

  // One elbow per match that has a next round to feed: out from the card, across to the midpoint,
  // vertically to the parent's centre line, then into the parent.
  const connectors = []
  for (const [round, roundMatches] of rounds) {
    if (round >= totalRounds) continue
    for (const match of roundMatches) {
      const fromX = colX(round) + CARD_W
      const fromY = centerY(round, match.slot)
      const toX = colX(round + 1)
      const toY = centerY(round + 1, Math.floor(match.slot / 2))
      const midX = fromX + COL_GAP / 2
      connectors.push({
        key: match.id,
        points: `${fromX},${fromY} ${midX},${fromY} ${midX},${toY} ${toX},${toY}`,
        lit: Boolean(match.winner),
      })
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width, height: height + 24 }}>
        {/* Round headings sit in the 24px strip reserved above the tree. */}
        {rounds.map(([round]) => (
          <p
            key={`h-${round}`}
            className="absolute top-0 text-[10px] font-semibold tracking-wide text-neutral-500 uppercase"
            style={{ left: colX(round), width: CARD_W }}
          >
            {roundName(round, totalRounds)}
          </p>
        ))}

        <svg
          className="pointer-events-none absolute left-0"
          style={{ top: 24, width, height }}
          width={width}
          height={height}
        >
          {connectors.map((c) => (
            <polyline
              key={c.key}
              points={c.points}
              fill="none"
              // A decided match's line lights up, so the path a film took to the final is
              // readable at a glance instead of every line looking the same.
              stroke={c.lit ? 'var(--color-brand)' : '#404040'}
              strokeWidth={c.lit ? 2 : 1}
            />
          ))}
        </svg>

        {rounds.map(([round, roundMatches]) =>
          roundMatches.map((match) => (
            <div
              key={match.id}
              className={`absolute overflow-hidden rounded-md border bg-ink-soft ${
                match.id === activeMatchId
                  ? 'border-brand ring-2 ring-brand/40'
                  : 'border-neutral-800'
              }`}
              style={{
                left: colX(round),
                top: 24 + centerY(round, match.slot) - CARD_H / 2,
                width: CARD_W,
                height: CARD_H,
              }}
            >
              <Side movieId={match.movie_a} match={match} moviesById={moviesById} isTop />
              <Side movieId={match.movie_b} match={match} moviesById={moviesById} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
