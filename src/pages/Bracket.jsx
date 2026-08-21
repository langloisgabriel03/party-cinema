import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import BattleMatchup from '@/components/BattleMatchup'
import BracketTree from '@/components/BracketTree'
import CatalogSearchPicker from '@/components/CatalogSearchPicker'
import {
  MAX_BRACKET,
  MIN_BRACKET,
  byeCount,
  cleanBracketSize,
  currentMatch,
  decideWinner,
  forceWinner,
  roundName,
  tallyVotes,
} from '@/data/bracket'
import { avatarSrc } from '@/data/avatars'
import { groupWatchlist, referencedMovieIds } from '@/data/plan'
import { notifyBracketRound } from '@/lib/push'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { useBracketStore } from '@/store/useBracketStore'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * Module scope, not inline in Bracket's body: a component defined during render is a brand-new
 * type on every render, so React unmounts and remounts the whole subtree each keystroke (losing
 * focus and re-fetching the avatars).
 */
function PlayerPicker({ profiles, selected, onToggle }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-400">Who&rsquo;s voting ({selected.length})</p>
      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => {
          const on = selected.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              aria-pressed={on}
              className={`flex cursor-pointer items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition-colors ${
                on ? 'bg-brand text-white' : 'bg-ink-raised text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              <img
                src={avatarSrc(p.avatar)}
                alt=""
                className={`size-6 rounded-full object-cover ${on ? '' : 'opacity-50 grayscale'}`}
              />
              {p.name}
            </button>
          )
        })}
      </div>
    </div>
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
  const participantIds = useBracketStore((state) => state.participantIds)
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
  const [watchlistCount, setWatchlistCount] = useState(null) // null = "not touched yet"
  const [playerIds, setPlayerIds] = useState(null) // null = "everyone", set on first toggle

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

  // Who this bracket waits on. participantIds is null for a bracket started before the roster
  // existed (or if that migration hasn't been run), which means everyone -- the old behaviour.
  const voters = useMemo(
    () => (participantIds ? profiles.filter((p) => participantIds.includes(p.id)) : profiles),
    [participantIds, profiles]
  )
  const canVote = !participantIds || participantIds.includes(profile?.id)

  // Auto-advance: whoever is looking when the deciding vote lands writes the result. resolveMatch
  // is guarded server-side (`.is('winner', null)`) so several clients doing this at once is safe.
  useEffect(() => {
    if (!active || !voters.length) return
    // Only the roster's votes count toward deciding it.
    const eligible = participantIds
      ? votes.filter((v) => participantIds.includes(v.profile_id))
      : votes
    const winner = decideWinner(active, eligible, moviesById, voters.length)
    if (winner) resolveMatch(active, winner, totalRounds)
  }, [active, votes, moviesById, voters.length, participantIds, resolveMatch, totalRounds])

  // Ping the roster when the matchup on the table changes round, and once more when a champion
  // is crowned. Keyed on round (not match) so a round of several matchups doesn't buzz everyone
  // per matchup; notify-bracket itself de-duplicates per (bracket, round) across clients, and
  // skips whoever triggered it since they're already looking at it.
  const notifiedRef = useRef(null)
  useEffect(() => {
    if (!bracket) return
    const key = bracket.status === 'complete' ? `${bracket.id}:done` : active && `${bracket.id}:${active.round}`
    if (!key || notifiedRef.current === key) return
    notifiedRef.current = key
    notifyBracketRound(bracket.id, bracket.status === 'complete' ? totalRounds + 1 : active.round, profile?.id)
  }, [bracket, active, totalRounds, profile?.id])

  if (!profile) return null

  const myVote = active ? votes.find((v) => v.match_id === active.id && v.profile_id === profile.id) : null
  // Tallies count the roster only, so a vote left over from someone dropped from the bracket
  // can't tip a match (or make the "n/n voted" counter overshoot).
  const rosterVotes = participantIds
    ? votes.filter((v) => participantIds.includes(v.profile_id))
    : votes
  const counts = active ? tallyVotes(rosterVotes, active.id) : new Map()
  const votersFor = (movieId) =>
    active
      ? rosterVotes
          .filter((v) => v.match_id === active.id && v.movie_id === movieId)
          .map((v) => profileById.get(v.profile_id))
          .filter(Boolean)
      : []

  const champion = bracket?.champion_movie_id ? moviesById.get(bracket.champion_movie_id) : null

  // Any count from 2 up now works -- an awkward number is padded with byes rather than rejected.
  const customIsValid = customIds.length >= MIN_BRACKET
  const customByes = byeCount(customIds.length)

  const maxFromWatchlist = Math.min(watchlistEntries.length, MAX_BRACKET)
  // Defaults to the largest power of two that fits, so the bracket everyone gets without
  // thinking about it has zero byes.
  const wlCount = Math.min(watchlistCount ?? cleanBracketSize(maxFromWatchlist), maxFromWatchlist)
  const wlByes = byeCount(wlCount)

  const selectedPlayers = playerIds ?? profiles.map((p) => p.id)
  const togglePlayer = (id) =>
    setPlayerIds((prev) => {
      const base = prev ?? profiles.map((p) => p.id)
      // Never let the roster empty out -- a bracket with no voters can never resolve a match.
      if (base.includes(id)) return base.length > 1 ? base.filter((x) => x !== id) : base
      return [...base, id]
    })


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

            <PlayerPicker profiles={profiles} selected={selectedPlayers} onToggle={togglePlayer} />

            <div className="flex flex-col gap-3 rounded-xl bg-ink-soft p-5">
              <h2 className="font-semibold">From the watchlist</h2>
              <p className="text-sm text-neutral-400">
                The most-wanted films go in, top seeds kept apart in the early rounds.
              </p>
              {maxFromWatchlist < MIN_BRACKET ? (
                <p className="text-sm text-neutral-500">
                  Add at least {MIN_BRACKET} movies to the watchlist first ({watchlistEntries.length}{' '}
                  so far).
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <label htmlFor="wl-count" className="text-sm text-neutral-400">
                      How many films
                    </label>
                    <input
                      id="wl-count"
                      type="number"
                      min={MIN_BRACKET}
                      max={maxFromWatchlist}
                      value={wlCount}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) {
                          setWatchlistCount(Math.max(MIN_BRACKET, Math.min(maxFromWatchlist, n)))
                        }
                      }}
                      className="w-20 rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
                    />
                    <span className="text-xs text-neutral-500">of {maxFromWatchlist}</span>
                  </div>
                  {wlByes > 0 && (
                    <p className="text-xs text-amber-400/80">
                      A bracket halves each round, so {wlCount} films need a {wlCount + wlByes}-slot
                      tree — the top {wlByes} seed{wlByes === 1 ? '' : 's'} get a free pass
                      (&ldquo;bye&rdquo;) through round 1. Use{' '}
                      <button
                        type="button"
                        onClick={() => setWatchlistCount(cleanBracketSize(maxFromWatchlist))}
                        className="cursor-pointer underline hover:text-amber-300"
                      >
                        {cleanBracketSize(maxFromWatchlist)}
                      </button>{' '}
                      for no byes.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      startBracket(
                        watchlistEntries.slice(0, wlCount).map((e) => e.movieId),
                        profile.id,
                        selectedPlayers
                      )
                    }
                    className="cursor-pointer self-start rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                  >
                    Start a {wlCount}-movie bracket
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-xl bg-ink-soft p-5">
              <h2 className="font-semibold">Pick your own line-up</h2>
              <p className="text-sm text-neutral-400">
                Search the whole catalog or pull from the watchlist. Any {MIN_BRACKET} or more —
                the order you add them is the seeding.
              </p>

              {customByes > 0 && customIsValid && (
                <p className="text-xs text-amber-400/80">
                  A bracket halves each round, so {customIds.length} films need a{' '}
                  {customIds.length + customByes}-slot tree — the top {customByes} seed
                  {customByes === 1 ? '' : 's'} get a free pass through round 1. Add{' '}
                  {customByes} more (or remove {customIds.length - cleanBracketSize(customIds.length)}) for
                  no byes.
                </p>
              )}

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
                    onClick={() => startBracket(customIds, profile.id, selectedPlayers)}
                    className="cursor-pointer rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                  >
                    Start a {customIds.length}-movie bracket
                  </button>
                ) : (
                  <span className="text-sm text-neutral-500">
                    {customIds.length} selected — pick at least {MIN_BRACKET}
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
                  onVote={(movieId) => canVote && castVote(active.id, movieId, profile.id)}
                  roundLabel={`${roundName(active.round, totalRounds)} — vote now`}
                  voterCount={voters.length}
                />
                {!canVote && (
                  <p className="rounded-lg bg-ink-soft p-3 text-sm text-neutral-400">
                    You&rsquo;re not in this bracket — {voters.map((v) => v.name).join(', ')}{' '}
                    {voters.length === 1 ? 'is' : 'are'} voting on it.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const winner = forceWinner(active, rosterVotes, moviesById)
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
                : ` — pick at least ${MIN_BRACKET}.`}
            </p>
            {/* Stays open on pick: closing on every pick would mean reopening it for each film
                in the line-up. Closed by hand when it's done. */}
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
