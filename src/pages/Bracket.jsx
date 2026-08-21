import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import BattleMatchup from '@/components/BattleMatchup'
import BracketTree from '@/components/BracketTree'
import {
  bracketSizeFor,
  currentMatch,
  decideWinner,
  forceWinner,
  roundName,
  tallyVotes,
} from '@/data/bracket'
import { groupWatchlist, referencedMovieIds } from '@/data/plan'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { useBracketStore } from '@/store/useBracketStore'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

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
              <>
                <BattleMatchup
                  match={active}
                  moviesById={moviesById}
                  countA={counts.get(active.movie_a) ?? 0}
                  countB={counts.get(active.movie_b) ?? 0}
                  votersA={votersFor(active.movie_a)}
                  votersB={votersFor(active.movie_b)}
                  myVote={myVote?.movie_id}
                  onVote={(movieId) => castVote(active.id, movieId, profile.id)}
                  roundLabel={`${roundName(active.round, totalRounds)} — vote now`}
                  voterCount={profiles.length}
                />
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
              </>
            )}

            <div className="flex flex-col gap-3 border-t border-neutral-800 pt-5">
              <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
                The bracket
              </h2>
              <BracketTree matches={matches} moviesById={moviesById} activeMatchId={active?.id} />
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
