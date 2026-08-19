import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AddProfileDialog from '@/components/AddProfileDialog'
import ProfileCard, { AddProfileTile } from '@/components/ProfileCard'
import { useAppStore } from '@/store/useAppStore'

export default function ProfileSelect() {
  const navigate = useNavigate()
  const profiles = useAppStore((state) => state.profiles)
  const addProfile = useAppStore((state) => state.addProfile)
  const selectProfile = useAppStore((state) => state.selectProfile)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleSelect = (profile) => {
    selectProfile(profile.id)
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-black tracking-tight text-brand sm:text-xl">
          PARTY CINEMA
        </span>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="cursor-pointer text-sm text-neutral-400 transition-colors hover:text-white"
        >
          + Add profile
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-20">
        <h1 className="text-center text-4xl font-light sm:text-6xl">Who&rsquo;s watching?</h1>

        <div className="flex max-w-4xl flex-wrap items-start justify-center gap-6 sm:gap-10">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} onSelect={handleSelect} />
          ))}
          {profiles.length === 0 && <AddProfileTile onClick={() => setDialogOpen(true)} />}
        </div>
      </main>

      <AddProfileDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(name, avatar) => addProfile(name, avatar)}
      />
    </div>
  )
}
