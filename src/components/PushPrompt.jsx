import { useEffect, useState } from 'react'

import { enablePush, isIOS, isStandalone, pushConfigured, pushSupported } from '@/lib/push'
import { useAppStore } from '@/store/useAppStore'

/**
 * Dismissible row, not a load-time prompt: browsers penalize permission requests that aren't
 * tied to a user gesture, and Safari ignores them outright. Gate is feature detection
 * (pushSupported()) first -- the iOS UA check only ever picks which hint to show, never whether
 * to show one, so desktop Firefox-in-private or an old Safari just render nothing instead of a
 * dead button.
 */
export default function PushPrompt() {
  const profileId = useAppStore((state) => state.currentProfileId)
  const dismissed = useAppStore((state) => state.pushPromptDismissed)
  const dismiss = useAppStore((state) => state.dismissPushPrompt)
  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [busy, setBusy] = useState(false)

  // Notification.permission can change from outside this component (another tab, a system
  // settings change) -- re-check on focus rather than trusting stale state indefinitely.
  useEffect(() => {
    const sync = () => setPermission(Notification.permission)
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  if (!pushConfigured) return null

  if (pushSupported()) {
    if (permission === 'granted') return null // already on, nothing to prompt

    if (permission === 'denied') {
      // No programmatic way back once denied. iOS specifically: only a Home Screen delete +
      // re-add resets it.
      if (!isIOS()) return null
      return (
        <p className="mb-4 rounded-lg bg-ink-soft p-3 text-sm text-neutral-400">
          Notifications are blocked. Delete Party Cinema from your Home Screen and re-add it to
          ask again.
        </p>
      )
    }

    if (dismissed) return null

    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-ink-soft p-3">
        <p className="text-sm text-neutral-300">
          Get notified when a movie night is booked, even with the app closed.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const result = await enablePush(profileId)
              setBusy(false)
              setPermission(typeof Notification !== 'undefined' ? Notification.permission : result)
            }}
            className="cursor-pointer rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Enabling…' : 'Turn on notifications'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-300"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  // pushManager doesn't exist here at all -- on iOS that's because this is a plain Safari tab,
  // not a Home Screen web app. Nothing to offer on any other unsupported browser.
  if (isIOS() && !isStandalone()) {
    return (
      <p className="mb-4 rounded-lg bg-ink-soft p-3 text-sm text-neutral-400">
        Add Party Cinema to your Home Screen (Share → Add to Home Screen) to get notified when a
        movie night is booked.
      </p>
    )
  }

  return null
}
