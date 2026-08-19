import { useEffect, useRef, useState } from 'react'

import { AVATARS, DEFAULT_AVATAR_ID, randomAvatarId } from '@/data/avatars'

export default function AddProfileDialog({ open, onClose, onSave }) {
  const dialogRef = useRef(null)
  const inputRef = useRef(null)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR_ID)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      // Reset on every open so the form never shows the previous entry.
      setName('')
      setAvatar(randomAvatarId())
      dialog.showModal()
      inputRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const trimmedName = name.trim()

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!trimmedName) return
    onSave(trimmedName, avatar)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      // Fires on Escape too, so the parent's `open` stays in sync with the real dialog state.
      onClose={onClose}
      // Backdrop clicks land on the <dialog> itself, never on its children.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-neutral-800 bg-ink-soft p-0 text-white"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-6">
        <h2 className="text-2xl font-semibold">Add profile</h2>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-neutral-400">Name</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            placeholder="e.g. Gabriel"
            className="rounded border border-neutral-700 bg-ink-raised px-3 py-2 text-base outline-none placeholder:text-neutral-500 focus:border-neutral-400"
          />
        </label>

        <fieldset className="border-0 p-0">
          <legend className="mb-2 text-sm text-neutral-400">Avatar</legend>
          <div className="flex flex-wrap gap-3">
            {AVATARS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setAvatar(option.id)}
                aria-pressed={avatar === option.id}
                aria-label={option.label}
                className={`size-14 cursor-pointer overflow-hidden rounded-lg transition-all ${
                  avatar === option.id
                    ? 'ring-4 ring-white'
                    : 'opacity-60 hover:opacity-100 focus-visible:opacity-100'
                }`}
              >
                <img src={option.src} alt="" className="size-full" />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-neutral-600 px-5 py-2 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmedName}
            className="cursor-pointer rounded bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            Save
          </button>
        </div>
      </form>
    </dialog>
  )
}
