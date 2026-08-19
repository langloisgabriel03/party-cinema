import { avatarSrc } from '@/data/avatars'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'

export default function Dashboard() {
  const profile = useCurrentProfile()
  const signOut = useAppStore((state) => state.signOut)

  // The route guard redirects when there's no profile; this covers the render before it runs.
  if (!profile) return null

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-black tracking-tight text-brand sm:text-xl">
          PARTY CINEMA
        </span>
        <div className="flex items-center gap-4">
          <img src={avatarSrc(profile.avatar)} alt="" className="size-9 rounded" />
          <button
            type="button"
            onClick={signOut}
            className="cursor-pointer text-sm text-neutral-400 transition-colors hover:text-white"
          >
            Switch profile
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-20 text-center">
        <h1 className="text-4xl font-semibold sm:text-5xl">Hello, {profile.name} 👋</h1>
        <p className="max-w-md text-neutral-400">
          This is where the shared watchlist and the movie-night calendar will live.
        </p>
      </main>
    </div>
  )
}
