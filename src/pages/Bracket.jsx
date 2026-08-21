import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import BattleMatchup from '@/components/BattleMatchup'
import BracketTree from '@/components/BracketTree'
import CatalogSearchPicker from '@/components/CatalogSearchPicker'
import {
  BRACKET_SIZES,
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

  // Hand-picked line-up, as an alternative to seeding straight off the watchlist.
  const [customIds, setCustomIds] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    initPlan()
    initBracket()
  }, [initPlan, initBracket])

  // showModal(), not the `open` attribute -- an `open` dialog renders inline in normal flow
  // instead of centred in the top layer. Same reasoning as Roulette's picker.
  useEffect(() => {
    const dialog = pickerRef.current
    if (!dialog) return
    if (pickerOpen && !dialog.open) dialog.showModal()
    else if (!pickerOpen && dialog.open) dialog.close()
  }, [pickerOpen])

  const ids = useMemo(() => {
    const fromMatches = matches.flatMap((m) => [m.movie_a, m.movie_b, m.winner]).filter(Boolean)
    return referencedMovieIds(watchlist, nightMovies).concat(fromMatches).concat(customIds)
  }, [watchlist, nightMovies, matches, customIds])
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

  // A bracket only works on a power of two, so the line-up has to land exactly on one of the
  // supported sizes -- otherwise say how many more are needed to reach the next one up.
  const customIsValid = BRACKET_SIZES.includes(customIds.length)
  const customTarget = BRACKET_SIZES.find((size) => size > customIds.length) ?? null
  const customNeeded = customTarget == null ? null : customTarget - customIds.length

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
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-300">
              Everyone votes on each head-to-head until one champion is left. Seed it automatically
              from the watchlist, or choose the line-up yourself.
            </p>

            <div className="flex flex-col gap-3 rounded-xl bg-ink-soft p-5">
              <h2 className="font-semibold">From the watchlist</h2>
              <p className="text-sm text-neutral-400">
                The most-wanted films go in, top seeds kept apart in the early rounds.
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

            <div className="flex flex-col gap-3 rounded-xl bg-ink-soft p-5">
              <h2 className="font-semibold">Pick your own line-up</h2>
              <p className="text-sm text-neutral-400">
                Search the whole catalog or pull from the watchlist. Needs exactly{' '}
                {BRACKET_SIZES.join(', ')} films — the order you add them is the seeding.
              </p>

              {customIds.length > 0 && (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {customIds.map((movieId, i) => {
                    const movie = moviesById.get(movieId)
                    return (
                      <div key={movieId} className="relative">
                        {movie?.poster ? (
                          <img src={movie.poster} alt="" className="aspect-2/3 w-full rounded object-cover" />
                        ) : (
                          <div className="flex aspect-2/3 w-full items-center justify-center rounded bg-ink-raised px-1 text-center text-[10px] text-neutral-500">
                            {movie?.title ?? '…'}
                          </div>
                        )}
                        <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[10px] font-semibold text-white">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCustomIds((prev) => prev.filter((id) => id !== movieId))}
                          aria-label={`Remove ${movie?.title ?? 'movie'} from the line-up`}
                          className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/80 text-xs text-white hover:bg-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="cursor-pointer rounded-lg border border-neutral-700 bg-ink-raised px-4 py-2.5 text-sm text-white transition-colors hover:border-neutral-400 hover:bg-neutral-700"
                >
                  + Add movies
                </button>
                {customIsValid ? (
                  <button
                    type="button"
                    onClick={() => startBracket(customIds, profile.id)}
                    className="cursor-pointer rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                  >
                    Start a {customIds.length}-movie bracket
                  </button>
                ) : (
                  <span className="text-sm text-neutral-500">
                    {customIds.length} selected
                    {customNeeded != null && ` — add ${customNeeded} more for a ${customTarget}-movie bracket`}
                  </span>
                )}
              </div>
            </div>
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

      {pickerOpen && (
        <dialog
          ref={pickerRef}
          onClose={() => setPickerOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false)
          }}
          className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
        >
          <div className="flex flex-col gap-4 p-5 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add to the line-up</h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="cursor-pointer text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              {customIds.length} selected
              {customIsValid
                ? ' — ready to start, or keep adding.'
                : customNeeded != null && ` — ${customNeeded} more for a ${customTarget}-movie bracket.`}
            </p>
            {/* Stays open on pick: a bracket needs at least four, so closing each time would mean
                reopening it three more times. Closed by hand when the line-up is done. */}
            <CatalogSearchPicker
              excludeIds={customIds}
              watchlistEntries={watchlistEntries}
              onPick={(movieId) =>
                setCustomIds((prev) =>
                  prev.includes(movieId) || prev.length >= 16 ? prev : [...prev, movieId]
                )
              }
            />
          </div>
        </dialog>
      )}
    </div>
  )
}
