import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'

export default function Games() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <AppHeader>
        <Link
          to="/dashboard"
          aria-label="Back to dashboard"
          className="flex size-11 items-center justify-center rounded-lg border border-neutral-700 bg-ink-raised text-lg text-white transition-colors hover:border-neutral-400 hover:bg-neutral-700"
        >
          ←
        </Link>
      </AppHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 sm:px-8">
        <h1 className="py-4 text-2xl font-semibold">Picker games</h1>
        <p className="pb-4 text-sm text-neutral-400">Can&rsquo;t agree on a movie? Let one of these decide.</p>

        <div className="flex flex-col gap-4">
          <Link
            to="/roulette"
            className="flex items-center gap-4 rounded-xl bg-ink-soft p-4 transition-colors hover:bg-ink-raised"
          >
            <span className="text-3xl">🎰</span>
            <div>
              <p className="text-lg font-semibold">Roulette</p>
              <p className="text-sm text-neutral-400">
                Everyone adds up to 2 movies to the pool, then spin to pick one at random.
              </p>
            </div>
          </Link>

          <Link
            to="/bracket"
            className="flex items-center gap-4 rounded-xl bg-ink-soft p-4 transition-colors hover:bg-ink-raised"
          >
            <span className="text-3xl">🏆</span>
            <div>
              <p className="text-lg font-semibold">Knockout Bracket</p>
              <p className="text-sm text-neutral-400">
                A tournament seeded from the watchlist — vote on each head-to-head until one
                champion remains.
              </p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
