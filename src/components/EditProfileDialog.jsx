import { useEffect, useRef, useState } from 'react'

import { AVATARS, avatarSrc, photosFor } from '@/data/avatars'
import { useAppStore } from '@/store/useAppStore'

/**
 * Change which picture a profile uses. Photos are whatever is in src/assets/photos/ for that
 * person (see avatars.js) -- there is no upload, so the choices are fixed at build time and
 * adding one means committing a file, not changing this component.
 */
export default function EditProfileDialog({ open, onClose, profile, switchable, onSwitch }) {
  const dialogRef = useRef(null)
  const updateProfileAvatar = useAppStore((state) => state.updateProfileAvatar)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  if (!profile) return null

  const photos = photosFor(profile.name)

  const choose = async (avatarId) => {
    if (saving || avatarId === profile.avatar) {
      if (avatarId === profile.avatar) onClose()
      return
    }
    setSaving(true)
    setSaveError(null)
    const result = await updateProfileAvatar(profile.id, avatarId)
    setSaving(false)
    if (result.ok) onClose()
    else setSaveError(result.error)
  }

  // Defined as a plain render helper, not a component: declaring a component inside render makes
  // it a new type every pass, remounting the tiles (and re-fetching every image) on each save.
  const tile = ({ id, src }) => (
    <button
      key={id}
      type="button"
      onClick={() => choose(id)}
      disabled={saving}
      aria-label={`Use this picture for ${profile.name}`}
      aria-pressed={profile.avatar === id}
      className={`cursor-pointer overflow-hidden rounded-lg ring-2 transition-all disabled:cursor-wait ${
        profile.avatar === id ? 'ring-brand' : 'ring-transparent hover:ring-neutral-500'
      }`}
    >
      <img src={src} alt="" draggable="false" className="aspect-square w-full object-cover" />
    </button>
  )

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(26rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={avatarSrc(profile.avatar)}
              alt=""
              className="size-10 rounded-lg object-cover"
            />
            <div>
              <p className="text-xs tracking-wide text-neutral-400 uppercase">Picture for</p>
              <p className="text-lg font-semibold">{profile.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {saveError && (
          <p className="rounded-lg bg-ink-raised p-3 text-sm text-red-400">{saveError}</p>
        )}

        {/* Only rendered for a profile allowed to edit everyone (see canEditAllProfiles). */}
        {switchable?.length > 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-neutral-400">Whose picture</p>
            <div className="flex flex-wrap gap-2">
              {switchable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSaveError(null)
                    onSwitch(p)
                  }}
                  aria-pressed={p.id === profile.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition-colors ${
                    p.id === profile.id
                      ? 'bg-brand text-white'
                      : 'bg-ink-raised text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  <img src={avatarSrc(p.avatar)} alt="" className="size-6 rounded-full object-cover" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-neutral-400">{profile.name}&rsquo;s photos</p>
            <div className="grid grid-cols-3 gap-3">{photos.map(tile)}</div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-400">
            {photos.length > 0 ? 'Or an icon' : 'Pick an icon'}
          </p>
          <div className="grid grid-cols-3 gap-3">{AVATARS.map(tile)}</div>
        </div>

        {photos.length === 0 && (
          <p className="text-xs text-neutral-500">
            No photos in the repo for {profile.name} yet — add {profile.name.toLowerCase()}.jpg (and{' '}
            {profile.name.toLowerCase()}_1.jpg, etc.) to src/assets/photos/.
          </p>
        )}
      </div>
    </dialog>
  )
}
