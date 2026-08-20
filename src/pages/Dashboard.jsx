import { Link } from 'react-router-dom'

import AppHeader from '@/components/AppHeader'
import { avatarSrc } from '@/data/avatars'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'

export default function Dashboard() {
  const profile = useCurrentProfile()
  const signOut = useAppStore((state) => state.signOut)

  // The route guard redirects when there's no profile; this covers the render before it runs.
  if (!profile) return null

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <AppHeader>
        <img src={avatarSrc(profile.avatar)} alt="" className="size-9 rounded" />
        <button
          type="button"
          onClick={signOut}
          className="cursor-pointer text-sm text-neutral-400 transition-colors hover:text-white"
        >
          Switch profile
        </button>
      </AppHeader>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-20 text-center">
        <h1 className="text-4xl font-semibold sm:text-5xl">Hello, {profile.name} 👋</h1>
        <p className="max-w-md text-neutral-400">
          This is where the shared watchlist and the movie-night calendar will live.
        </p>
        <Link
          to="/movies"
          className="mt-4 rounded bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Browse movies
        </Link>
      </main>
    </div>
  )
}
