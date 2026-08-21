import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import MonthCalendar from '@/components/MonthCalendar'
import NightDialog from '@/components/NightDialog'
import UpcomingNights from '@/components/UpcomingNights'
import WatchlistCard from '@/components/WatchlistCard'
import { avatarSrc } from '@/data/avatars'
import { formatNightDate, todayISO } from '@/data/dates'
import { groupWatchlist, nextUpcomingNight, referencedMovieIds, upcomingNights } from '@/data/plan'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'
import { usePlanStore } from '@/store/usePlanStore'

const WATCHLIST_PREVIEW_COUNT = 12

export default function Dashboard() {
  const profile = useCurrentProfile()
  const signOut = useAppStore((state) => state.signOut)
  const profiles = useAppStore((state) => state.profiles)

  const watchlist = usePlanStore((state) => state.watchlist)
  const nights = usePlanStore((state) => state.nights)
  const nightMovies = usePlanStore((state) => state.nightMovies)
  const nightMoviesByNight = usePlanStore((state) => state.nightMoviesByNight)
  const planLoading = usePlanStore((state) => state.planLoading)
  const planError = usePlanStore((state) => state.planError)
  const initPlan = usePlanStore((state) => state.initPlan)

  const moviesById = useMovieCatalogStore((state) => state.moviesById)
  const ensureMovies = useMovieCatalogStore((state) => state.ensureMovies)

  const [selectedDate, setSelectedDate] = useState(null)
  const [watchlistExpanded, setWatchlistExpanded] = useState(false)

  useEffect(() => {
    initPlan()
  }, [initPlan])

  // Targeted backfill: only the movies the watchlist/nights actually reference (not the full
  // catalog) -- see useMovieCatalogStore's ensureMovies for why this beats an eager full fetch.
  const ids = useMemo(() => referencedMovieIds(watchlist, nightMovies), [watchlist, nightMovies])
  useEffect(() => {
    if (ids.length) ensureMovies(ids)
  }, [ids, ensureMovies])

  const entries = useMemo(
    () => groupWatchlist(watchlist, moviesById, profiles),
    [watchlist, moviesById, profiles]
  )
  const upcoming = useMemo(() => upcomingNights(nights), [nights])
  const nextNight = useMemo(() => nextUpcomingNight(nights), [nights])
  const nightsByDate = useMemo(() => {
    const map = new Map()
    for (const night of nights) map.set(night.scheduled_for, (map.get(night.scheduled_for) ?? 0) + 1)
    return map
  }, [nights])

  const nightsOnSelectedDate = useMemo(
    () => (selectedDate ? nights.filter((n) => n.scheduled_for === selectedDate) : []),
    [nights, selectedDate]
  )

  const visibleEntries = watchlistExpanded ? entries : entries.slice(0, WATCHLIST_PREVIEW_COUNT)
  const nextNightMovieIds = nextNight ? (nightMoviesByNight.get(nextNight.id) ?? []) : []
  const nextNightFirstMovie = nextNightMovieIds.length ? moviesById.get(nextNightMovieIds[0]) : null
  const nextNightExtraCount = nextNightMovieIds.length - 1

  // The route guard redirects when there's no profile; this covers the render before it runs.
  if (!profile) return null

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <AppHeader>
        <Link
          to="/movies"
          className="animate-nudge rounded-lg border border-neutral-700 bg-ink-raised px-4 py-2 text-base font-semibold text-white transition-colors hover:border-neutral-400 hover:bg-neutral-700"
        >
          Movies
        </Link>
        <button
          type="button"
          onClick={signOut}
          aria-label="Switch profile"
          title="Switch profile"
          className="cursor-pointer"
        >
          <img
            src={avatarSrc(profile.avatar)}
            alt=""
            className="size-12 rounded-full object-cover ring-2 ring-transparent transition-all hover:ring-white"
          />
        </button>
      </AppHeader>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-8">
        <h1 className="py-4 text-2xl font-semibold">Hello, {profile.name} 👋</h1>

        {planError && (
          <p className="mb-4 rounded-lg bg-ink-soft p-3 text-sm text-red-400">
            Couldn&rsquo;t reach movie night plans: {planError}
          </p>
        )}

        {planLoading ? (
          <p className="text-neutral-500">Loading movie night plans…</p>
        ) : (
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-10">
            <div className="flex flex-col gap-6 lg:sticky lg:top-6">
              {/* Next night hero */}
              {nextNight ? (
                <button
                  type="button"
                  onClick={() => setSelectedDate(nextNight.scheduled_for)}
                  className="flex cursor-pointer items-center gap-4 rounded-xl bg-ink-soft p-4 text-left hover:bg-ink-raised"
                >
                  {nextNightFirstMovie?.poster && (
                    <img
                      src={nextNightFirstMovie.poster}
                      alt=""
                      className="aspect-2/3 w-16 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs tracking-wide text-neutral-400 uppercase">Next movie night</p>
                    <p className="truncate text-lg font-semibold">{formatNightDate(nextNight.scheduled_for)}</p>
                    <p className="truncate text-sm text-neutral-400">
                      {nextNightFirstMovie
                        ? `${nextNightFirstMovie.title}${nextNightExtraCount > 0 ? ` +${nextNightExtraCount} more` : ''}`
                        : nextNightMovieIds.length
                          ? '…'
                          : 'Pick a film →'}
                    </p>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayISO())}
                  className="cursor-pointer rounded-xl bg-ink-soft p-4 text-left hover:bg-ink-raised"
                >
                  <p className="text-lg font-semibold">Plan a night</p>
                  <p className="text-sm text-neutral-400">No movie nights scheduled yet — tap to add one.</p>
                </button>
              )}

              <MonthCalendar nightsByDate={nightsByDate} onSelectDate={setSelectedDate} />

              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
                  Upcoming nights
                </h2>
                <UpcomingNights
                  nights={upcoming}
                  moviesById={moviesById}
                  nightMoviesByNight={nightMoviesByNight}
                  onSelect={setSelectedDate}
                />
              </section>
            </div>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
                  Soon to watch
                </h2>
                <Link to="/movies" className="text-sm text-brand hover:text-brand-hover">
                  + Add movies
                </Link>
              </div>

              {entries.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Nobody&rsquo;s added a movie yet — browse the catalog and tap + on anything you want
                  to watch.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {visibleEntries.map((entry) => (
                      <WatchlistCard key={entry.movieId} entry={entry} />
                    ))}
                  </div>
                  {entries.length > WATCHLIST_PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setWatchlistExpanded((expanded) => !expanded)}
                      className="cursor-pointer self-start text-sm text-neutral-400 hover:text-white"
                    >
                      {watchlistExpanded ? 'Show less' : `See all (${entries.length})`}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>

      {selectedDate && (
        <NightDialog
          open={Boolean(selectedDate)}
          onClose={() => setSelectedDate(null)}
          iso={selectedDate}
          dateLabel={formatNightDate(selectedDate)}
          nights={nightsOnSelectedDate}
          moviesById={moviesById}
          nightMoviesByNight={nightMoviesByNight}
          watchlistEntries={entries}
        />
      )}
    </div>
  )
}
