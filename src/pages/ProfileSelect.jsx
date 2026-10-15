import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AddProfileDialog from '@/components/AddProfileDialog'
import AdminCodeDialog from '@/components/AdminCodeDialog'
import AppHeader from '@/components/AppHeader'
import ProfileCard, { AddProfileTile } from '@/components/ProfileCard'
import { isAdmin } from '@/data/avatars'
import { useAppStore } from '@/store/useAppStore'

export default function ProfileSelect() {
  const navigate = useNavigate()
  const profiles = useAppStore((state) => state.profiles)
  const loading = useAppStore((state) => state.profilesLoading)
  const error = useAppStore((state) => state.profilesError)
  const selectProfile = useAppStore((state) => state.selectProfile)
  const adminUnlocked = useAppStore((state) => state.adminUnlocked)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [codeFor, setCodeFor] = useState(null)

  const enter = (profile) => {
    selectProfile(profile.id)
    navigate('/dashboard')
  }

  const handleSelect = (profile) => {
    // Asked once per browser: after that `adminUnlocked` is remembered and this tile behaves
    // like any other.
    if (isAdmin(profile) && !adminUnlocked) setCodeFor(profile)
    else enter(profile)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <AppHeader>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="cursor-pointer text-sm text-neutral-400 transition-colors hover:text-white"
        >
          + Add profile
        </button>
      </AppHeader>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-20">
        <h1 className="text-center text-4xl font-light sm:text-6xl">Who&rsquo;s watching?</h1>

        {loading ? (
          <p className="text-neutral-500">Loading profiles…</p>
        ) : (
          <div className="flex max-w-4xl flex-wrap items-start justify-center gap-6 sm:gap-10">
            {profiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} onSelect={handleSelect} />
            ))}
            {profiles.length === 0 && <AddProfileTile onClick={() => setDialogOpen(true)} />}
          </div>
        )}

        {error && (
          <p className="max-w-md text-center text-sm text-red-400">
            Couldn&rsquo;t reach the shared profile list: {error}
          </p>
        )}
      </main>

      <AddProfileDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <AdminCodeDialog
        open={Boolean(codeFor)}
        onClose={() => setCodeFor(null)}
        onUnlocked={() => {
          const profile = codeFor
          setCodeFor(null)
          enter(profile)
        }}
      />
    </div>
  )
}
