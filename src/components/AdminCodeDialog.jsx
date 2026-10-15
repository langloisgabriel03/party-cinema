import { useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store/useAppStore'

/** Code prompt shown when the admin profile is picked on a browser that hasn't entered it yet. */
export default function AdminCodeDialog({ open, onClose, onUnlocked }) {
  const dialogRef = useRef(null)
  const unlockAdmin = useAppStore((state) => state.unlockAdmin)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    if (open) {
      setCode('')
      setError(false)
    }
  }, [open])

  const submit = (event) => {
    event.preventDefault()
    if (unlockAdmin(code)) onUnlocked()
    else setError(true)
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="dialog-sheet [--dialog-width:22rem] overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:rounded-lg sm:border"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Enter code</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-neutral-400">This profile manages everyone&rsquo;s stuff.</p>

        {/* inputMode numeric for the phone keypad; type=password so it isn't readable over a
            shoulder. autoFocus is safe here -- the dialog only opens on a deliberate tap. */}
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setError(false)
          }}
          placeholder="Code"
          aria-label="Admin code"
          aria-invalid={error}
          className="rounded border border-neutral-700 bg-ink-raised px-3 py-2.5 text-center text-lg tracking-[0.4em] text-white outline-none placeholder:tracking-normal placeholder:text-neutral-500 focus:border-neutral-400"
        />

        {error && <p className="text-sm text-red-400">Wrong code.</p>}

        <button
          type="submit"
          disabled={!code}
          className="cursor-pointer rounded bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </form>
    </dialog>
  )
}
