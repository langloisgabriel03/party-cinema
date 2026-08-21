import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import {
  bracketSizeFor,
  currentMatch,
  decideWinner,
  forceWinner,
  matchesByRound,
  roundCount,
  roundName,
  tallyVotes,
} from '@/data/bracket'
import { avatarSrc } from '@/data/avatars'
import { scoreColor } from '@/data/movieCatalog'
import { groupWatchlist, referencedMovieIds } from '@/data/plan'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { useBracketStore } from '@/store/useBracketStore'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

function MoviePick({ movie, votes, voters, selected, disabled, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`flex flex-1 cursor-pointer flex-col gap-2 rounded-lg border-2 p-3 text-left transition-colors disabled:cursor-default ${
        selected ? 'border-brand bg-brand/10' : 'border-neutral-800 bg-ink-soft hover:border-neutral-600'
      }`}
    >
      {movie?.poster ? (
        <img src={movie.poster} alt="" className="aspect-2/3 w-full rounded object-cover" />
      ) : (
        <div className="flex aspect-2/3 w-full items-center justify-center rounded bg-ink-raised px-2 text-center text-xs text-neutral-500">
          {movie?.title ?? '…'}
        </div>
      )}
      <p className="line-clamp-2 text-sm font-medium text-white">{movie?.title ?? 'Loading…'}</p>
      {movie && (
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={scoreColor(movie.tomatometer)}>
            🍅{movie.tomatometer != null ? `${movie.tomatometer}%` : '—'}
          </span>
          <span className={scoreColor(movie.audience_score)}>
            🍿{movie.audience_score != null ? `${movie.audience_score}%` : '—'}
          </span>
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-white">{votes}</span>
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

export default function Bracket() {
  const profile = useCurrentProfile()
  const profiles = useAppStore((state) => state.profiles)

  const watchlist = usePlanStore((state) => state.watchlist)
  const nightMovies = usePlanStore((state) => state.nightMovies)
  const initPlan = usePlanStore((state) => state.initPlan)

  const bracket = useBracketStore((state) => state.bracket)
  const matches = useBracketStore((state) => state.matches)
  const votes = useBracketStore((state) => state.votes)
  const bracketLoading = useBracketStore((state) => state.bracketLoading)
  const bracketError = useBracketStore((state) => state.bracketError)
  const initBracket = useBracketStore((state) => state.initBracket)
  const startBracket = useBracketStore((state) => state.startBracket)
  const castVote = useBracketStore((state) => state.castVote)
  const resolveMatch = useBracketStore((state) => state.resolveMatch)
  const clearBracket = useBracketStore((state) => state.clearBracket)

  const moviesById = useMovieCatalogStore((state) => state.moviesById)
  const ensureMovies = useMovieCatalogStore((state) => state.ensureMovies)
  const [showFullTree, setShowFullTree] = useState(false)

  useEffect(() => {
    initPlan()
    initBracket()
  }, [initPlan, initBracket])

  const ids = useMemo(() => {
    const fromMatches = matches.flatMap((m) => [m.movie_a, m.movie_b, m.winner]).filter(Boolean)
    return referencedMovieIds(watchlist, nightMovies).concat(fromMatches)
  }, [watchlist, nightMovies, matches])
  useEffect(() => {
    if (ids.length) ensureMovies(ids)
  }, [ids, ensureMovies])

  const watchlistEntries = useMemo(
    () => groupWatchlist(watchlist, moviesById, profiles),
    [watchlist, moviesById, profiles]
  )
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])

  const totalRounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 0
  const active = useMemo(() => currentMatch(matches), [matches])
  const eligibleSize = bracketSizeFor(watchlistEntries.length)

  // Auto-advance: whoever is looking when the deciding vote lands writes the result. resolveMatch
  // is guarded server-side (`.is('winner', null)`) so several clients doing this at once is safe.
  useEffect(() => {
    if (!active || !profiles.length) return
    const winner = decideWinner(active, votes, moviesById, profiles.length)
    if (winner) resolveMatch(active, winner, totalRounds)
  }, [active, votes, moviesById, profiles.length, resolveMatch, totalRounds])

  if (!profile) return null

  const myVote = active ? votes.find((v) => v.match_id === active.id && v.profile_id === profile.id) : null
  const counts = active ? tallyVotes(votes, active.id) : new Map()
  const votersFor = (movieId) =>
    active
      ? votes
          .filter((v) => v.match_id === active.id && v.movie_id === movieId)
          .map((v) => profileById.get(v.profile_id))
          .filter(Boolean)
      : []

  const champion = bracket?.champion_movie_id ? moviesById.get(bracket.champion_movie_id) : null

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <AppHeader>
        <Link
          to="/games"
          aria-label="Back to games"
          className="flex size-11 items-center justify-center rounded-lg border border-neutral-700 bg-ink-raised text-lg text-white transition-colors hover:border-neutral-400 hover:bg-neutral-700"
        >
          ←
        </Link>
      </AppHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-8">
        <h1 className="py-4 text-2xl font-semibold">🏆 Knockout Bracket</h1>

        {bracketError && (
          <p className="mb-4 rounded-lg bg-ink-soft p-3 text-sm text-red-400">{bracketError}</p>
        )}

        {bracketLoading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : !bracket ? (
          <div className="flex flex-col gap-4 rounded-xl bg-ink-soft p-5">
            <p className="text-sm text-neutral-300">
              Build a tournament from the shared watchlist — the most-wanted films are seeded first,
              then everyone votes on each head-to-head until one champion is left.
            </p>
            {eligibleSize === 0 ? (
              <p className="text-sm text-neutral-500">
                Add at least 4 movies to the watchlist first ({watchlistEntries.length} so far).
              </p>
            ) : (
              <button
                type="button"
                onClick={() =>
                  startBracket(
                    watchlistEntries.slice(0, eligibleSize).map((e) => e.movieId),
                    profile.id
                  )
                }
                className="cursor-pointer self-start rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Start a {eligibleSize}-movie bracket
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {champion && (
              <div className="flex items-center gap-4 rounded-xl bg-brand/20 p-4">
                {champion.poster && (
                  <img src={champion.poster} alt="" className="aspect-2/3 w-20 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-xs tracking-wide text-brand uppercase">🏆 Champion</p>
                  <p className="text-xl font-semibold">{champion.title}</p>
                </div>
              </div>
            )}

            {active && (
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
                    {roundName(active.round, totalRounds)} — vote now
                  </h2>
                  <span className="text-xs text-neutral-500">
                    {[...counts.values()].reduce((a, b) => a + b, 0)}/{profiles.length} voted
                  </span>
                </div>
                <div className="flex items-stretch gap-3">
                  <MoviePick
                    movie={moviesById.get(active.movie_a)}
                    votes={counts.get(active.movie_a) ?? 0}
                    voters={votersFor(active.movie_a)}
                    selected={myVote?.movie_id === active.movie_a}
                    onPick={() => castVote(active.id, active.movie_a, profile.id)}
                  />
                  <div className="flex items-center text-sm font-bold text-neutral-600">VS</div>
                  <MoviePick
                    movie={moviesById.get(active.movie_b)}
                    votes={counts.get(active.movie_b) ?? 0}
                    voters={votersFor(active.movie_b)}
                    selected={myVote?.movie_id === active.movie_b}
                    onPick={() => castVote(active.id, active.movie_b, profile.id)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const winner = forceWinner(active, votes, moviesById)
                    if (winner) resolveMatch(active, winner, totalRounds)
                  }}
                  className="cursor-pointer self-start text-sm text-neutral-400 hover:text-white"
                  title="Resolve this matchup with the votes cast so far"
                >
                  Skip waiting — decide with current votes
                </button>
              </section>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowFullTree((v) => !v)}
                className="cursor-pointer self-start text-sm text-brand hover:text-brand-hover"
              >
                {showFullTree ? 'Hide full bracket' : 'Show full bracket'}
              </button>

              {showFullTree && (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {matchesByRound(matches).map(([round, roundMatches]) => (
                    <div key={round} className="flex min-w-40 flex-col gap-2">
                      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                        {roundName(round, totalRounds)}
                      </p>
                      {roundMatches.map((match) => (
                        <div key={match.id} className="flex flex-col gap-1 rounded-lg bg-ink-soft p-2 text-xs">
                          {[match.movie_a, match.movie_b].map((movieId, i) => (
                            <p
                              key={i}
                              className={`truncate ${
                                match.winner === movieId && movieId
                                  ? 'font-semibold text-brand'
                                  : 'text-neutral-400'
                              }`}
                            >
                              {movieId ? (moviesById.get(movieId)?.title ?? '…') : '—'}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={clearBracket}
              className="cursor-pointer self-start text-sm text-red-400 hover:text-red-300"
            >
              {champion ? 'Clear and start over' : 'Cancel this bracket'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
