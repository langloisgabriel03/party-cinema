import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import CatalogSearchPicker from '@/components/CatalogSearchPicker'
import RouletteCard from '@/components/RouletteCard'
import { referencedMovieIds, groupWatchlist } from '@/data/plan'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

const MAX_PER_PROFILE = 2
// Full loops before landing on the winner, plus the deceleration curve -- long enough to read as
// a genuine spin, short enough not to feel like a stall.
const SPIN_LOOPS = 3
const SPIN_START_DELAY = 90
const SPIN_DECAY = 1.12

export default function Roulette() {
  const profile = useCurrentProfile()
  const profiles = useAppStore((state) => state.profiles)

  const watchlist = usePlanStore((state) => state.watchlist)
  const rouletteEntries = usePlanStore((state) => state.rouletteEntries)
  const nightMovies = usePlanStore((state) => state.nightMovies)
  const planLoading = usePlanStore((state) => state.planLoading)
  const planError = usePlanStore((state) => state.planError)
  const initPlan = usePlanStore((state) => state.initPlan)
  const addToRoulette = usePlanStore((state) => state.addToRoulette)

  const moviesById = useMovieCatalogStore((state) => state.moviesById)
  const ensureMovies = useMovieCatalogStore((state) => state.ensureMovies)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [highlightedId, setHighlightedId] = useState(null)
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const spinTimeout = useRef(null)

  useEffect(() => {
    initPlan()
  }, [initPlan])

  useEffect(() => () => clearTimeout(spinTimeout.current), [])

  const ids = useMemo(
    () => referencedMovieIds(watchlist, nightMovies).concat(rouletteEntries.map((e) => e.movie_id)),
    [watchlist, nightMovies, rouletteEntries]
  )
  useEffect(() => {
    if (ids.length) ensureMovies(ids)
  }, [ids, ensureMovies])

  const watchlistEntries = useMemo(
    () => groupWatchlist(watchlist, moviesById, profiles),
    [watchlist, moviesById, profiles]
  )
  const pool = useMemo(
    () => groupWatchlist(rouletteEntries, moviesById, profiles),
    [rouletteEntries, moviesById, profiles]
  )

  const ownEntryCount = profile
    ? rouletteEntries.filter((e) => e.added_by === profile.id).length
    : 0
  const atCap = ownEntryCount >= MAX_PER_PROFILE
  const ownExcludeIds = profile
    ? rouletteEntries.filter((e) => e.added_by === profile.id).map((e) => e.movie_id)
    : []

  const spin = () => {
    if (pool.length < 2 || spinning) return
    setWinner(null)
    setSpinning(true)
    const winnerIndex = Math.floor(Math.random() * pool.length)
    const totalTicks = SPIN_LOOPS * pool.length + winnerIndex + 1

    let tick = 0
    let delay = SPIN_START_DELAY
    const step = () => {
      setHighlightedId(pool[tick % pool.length].movieId)
      tick += 1
      if (tick >= totalTicks) {
        setSpinning(false)
        setWinner(pool[winnerIndex])
        return
      }
      delay *= SPIN_DECAY
      spinTimeout.current = setTimeout(step, delay)
    }
    step()
  }

  if (!profile) return null

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

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 sm:px-8">
        <h1 className="py-4 text-2xl font-semibold">🎰 Roulette</h1>

        {planError && (
          <p className="mb-4 rounded-lg bg-ink-soft p-3 text-sm text-red-400">{planError}</p>
        )}

        {winner && (
          <div className="mb-4 flex items-center gap-4 rounded-xl bg-brand/20 p-4">
            {winner.movie?.poster && (
              <img src={winner.movie.poster} alt="" className="aspect-2/3 w-16 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs tracking-wide text-brand uppercase">🎉 Winner</p>
              <p className="truncate text-lg font-semibold">{winner.movie?.title ?? 'Loading…'}</p>
            </div>
            <button
              type="button"
              onClick={() => setWinner(null)}
              aria-label="Dismiss"
              className="cursor-pointer text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={spin}
            disabled={pool.length < 2 || spinning}
            className="cursor-pointer rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {spinning ? 'Spinning…' : '🎰 Spin'}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={atCap}
            title={atCap ? `You've already added ${MAX_PER_PROFILE} — remove one to add another` : undefined}
            className="cursor-pointer rounded-lg border border-neutral-700 bg-ink-raised px-4 py-2.5 text-sm text-white transition-colors hover:border-neutral-400 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add a movie
          </button>
          <span className="text-sm text-neutral-500">
            You&rsquo;ve added {ownEntryCount}/{MAX_PER_PROFILE}
          </span>
          {pool.length < 2 && (
            <span className="text-sm text-neutral-500">Add at least 2 movies to spin.</span>
          )}
        </div>

        {planLoading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : pool.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nobody&rsquo;s added a movie to the roulette yet — everyone can add up to {MAX_PER_PROFILE}.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pool.map((entry) => (
              <RouletteCard key={entry.movieId} entry={entry} highlighted={highlightedId === entry.movieId} />
            ))}
          </div>
        )}
      </main>

      {pickerOpen && (
        <dialog
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false)
          }}
          className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
        >
          <div className="flex flex-col gap-4 p-5 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add to roulette</h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="cursor-pointer text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <CatalogSearchPicker
              excludeIds={ownExcludeIds}
              watchlistEntries={watchlistEntries}
              onPick={(movieId) => {
                addToRoulette(movieId, profile.id)
                setPickerOpen(false)
              }}
            />
          </div>
        </dialog>
      )}
    </div>
  )
}
