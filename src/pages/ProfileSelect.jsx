import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AddProfileDialog from '@/components/AddProfileDialog'
import AppHeader from '@/components/AppHeader'
import EditProfileDialog from '@/components/EditProfileDialog'
import ProfileCard, { AddProfileTile } from '@/components/ProfileCard'
import { useAppStore } from '@/store/useAppStore'

export default function ProfileSelect() {
  const navigate = useNavigate()
  const profiles = useAppStore((state) => state.profiles)
  const loading = useAppStore((state) => state.profilesLoading)
  const error = useAppStore((state) => state.profilesError)
  const selectProfile = useAppStore((state) => state.selectProfile)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState(null)

  const handleSelect = (profile) => {
    selectProfile(profile.id)
    navigate('/dashboard')
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
        <h1 className="text-center text-4xl font-light sm:text-6xl">
          {managing ? 'Manage profiles' : "Who's watching?"}
        </h1>

        {loading ? (
          <p className="text-neutral-500">Loading profiles…</p>
        ) : (
          <div className="flex max-w-4xl flex-wrap items-start justify-center gap-6 sm:gap-10">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onSelect={handleSelect}
                managing={managing}
                onEdit={setEditing}
              />
            ))}
            {profiles.length === 0 && <AddProfileTile onClick={() => setDialogOpen(true)} />}
          </div>
        )}

        {profiles.length > 0 && (
          <button
            type="button"
            onClick={() => setManaging((v) => !v)}
            className="cursor-pointer rounded border border-neutral-600 px-5 py-2 text-sm tracking-wide text-neutral-400 uppercase transition-colors hover:border-white hover:text-white"
          >
            {managing ? 'Done' : 'Manage profiles'}
          </button>
        )}

        {error && (
          <p className="max-w-md text-center text-sm text-red-400">
            Couldn&rsquo;t reach the shared profile list: {error}
          </p>
        )}
      </main>

      <AddProfileDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <EditProfileDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        // Read back from the live list so the ticked tile updates as soon as the save lands.
        profile={editing ? (profiles.find((p) => p.id === editing.id) ?? editing) : null}
      />
    </div>
  )
}
