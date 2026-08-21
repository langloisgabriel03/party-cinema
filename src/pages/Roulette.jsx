import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import CatalogSearchPicker from '@/components/CatalogSearchPicker'
import RouletteCard from '@/components/RouletteCard'
import RouletteWheel from '@/components/RouletteWheel'
import { groupWatchlist, referencedMovieIds } from '@/data/plan'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

const MAX_PER_PROFILE = 2

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
  const pickerRef = useRef(null)
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)
  // Frozen for the duration of a spin: the wheel animates toward a wedge *index*, so if someone
  // adds or removes a movie mid-spin the wedges would re-slice underneath it and the pointer
  // would land on a different film than the one picked. Snapshotting keeps them in lockstep.
  const [wheelPool, setWheelPool] = useState(null)
  const [winnerIndex, setWinnerIndex] = useState(null)

  useEffect(() => {
    initPlan()
  }, [initPlan])

  // showModal(), not the `open` attribute: an `open` dialog renders inline in normal flow, which
  // on desktop put the picker below the poster grid where it had to be scrolled to. showModal
  // promotes it to the top layer (centered, with a backdrop) like every other dialog in the app.
  useEffect(() => {
    const dialog = pickerRef.current
    if (!dialog) return
    if (pickerOpen && !dialog.open) dialog.showModal()
    else if (!pickerOpen && dialog.open) dialog.close()
  }, [pickerOpen])

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

  const ownEntries = profile ? rouletteEntries.filter((e) => e.added_by === profile.id) : []
  const ownEntryCount = ownEntries.length
  const atCap = ownEntryCount >= MAX_PER_PROFILE
  const ownExcludeIds = ownEntries.map((e) => e.movie_id)

  const displayPool = wheelPool ?? pool

  const spin = () => {
    if (pool.length < 2 || spinning) return
    setWinner(null)
    setWheelPool(pool)
    setWinnerIndex(Math.floor(Math.random() * pool.length))
    setSpinning(true)
  }

  const handleSpinEnd = () => {
    setSpinning(false)
    if (wheelPool && winnerIndex != null) setWinner(wheelPool[winnerIndex])
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

        <RouletteWheel
          entries={displayPool}
          spinning={spinning}
          winnerIndex={winnerIndex}
          onSpinEnd={handleSpinEnd}
        />

        {winner && !spinning && (
          <div className="mx-auto mt-4 flex max-w-md items-center gap-4 rounded-xl bg-brand/20 p-4">
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

        <div className="my-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={spin}
            disabled={pool.length < 2 || spinning}
            className="cursor-pointer rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {spinning ? 'Spinning…' : '🎰 Spin'}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={atCap}
            title={atCap ? `You've already added ${MAX_PER_PROFILE} — remove one to add another` : undefined}
            className="cursor-pointer rounded-lg border border-neutral-700 bg-ink-raised px-4 py-3 text-sm text-white transition-colors hover:border-neutral-400 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add a movie ({ownEntryCount}/{MAX_PER_PROFILE})
          </button>
        </div>

        {pool.length < 2 && !planLoading && (
          <p className="pb-4 text-center text-sm text-neutral-500">Add at least 2 movies to spin.</p>
        )}

        {planLoading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : pool.length === 0 ? (
          <p className="text-center text-sm text-neutral-500">
            Nobody&rsquo;s added a movie to the roulette yet — everyone can add up to {MAX_PER_PROFILE}.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pool.map((entry) => (
              <RouletteCard key={entry.movieId} entry={entry} />
            ))}
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
              <h2 className="text-lg font-semibold">Add to roulette</h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="cursor-pointer text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              You&rsquo;ve added {ownEntryCount} of {MAX_PER_PROFILE}
              {ownEntryCount < MAX_PER_PROFILE - 1
                ? ' — pick another, or close when you’re done.'
                : ''}
            </p>
            <CatalogSearchPicker
              excludeIds={ownExcludeIds}
              watchlistEntries={watchlistEntries}
              onPick={async (movieId) => {
                await addToRoulette(movieId, profile.id)
                // Unlike NightDialog (one film, always close on pick), a person gets two picks
                // here -- so only close once they've used the last one, otherwise leave it open
                // to pick again and let them dismiss it themselves.
                if (ownEntryCount + 1 >= MAX_PER_PROFILE) setPickerOpen(false)
              }}
            />
          </div>
        </dialog>
      )}
    </div>
  )
}
