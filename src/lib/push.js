/**
 * Web push subscribe/unsubscribe + service worker registration.
 *
 * To regenerate the VAPID keypair (only ever needed once, or on a deliberate rotation):
 *
 *   node --input-type=module -e "
 *   import { webcrypto } from 'node:crypto'
 *   const { subtle } = webcrypto
 *   const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
 *   const publicKey = await subtle.exportKey('jwk', kp.publicKey)
 *   const privateKey = await subtle.exportKey('jwk', kp.privateKey)
 *   const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey))
 *   console.log('VITE_VAPID_PUBLIC_KEY=' + Buffer.from(raw).toString('base64url'))
 *   console.log('VAPID_KEYS secret =', JSON.stringify({ publicKey, privateKey }))
 *   "
 *
 * Both lines MUST come from the same run -- a mismatch means every push 403s forever with no
 * client-side symptom. The public line goes in .env / the GitHub Actions secret; the "VAPID_KEYS
 * secret" line goes into the notify-night Edge Function's secret of the same name.
 */

import { supabase, supabaseConfigured } from '@/lib/supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Same graceful-degradation contract as supabaseConfigured: a missing key leaves the app
// working with the notification UI absent, not crashing in atob() at first render.
export const pushConfigured = Boolean(supabaseConfigured && VAPID_PUBLIC_KEY)

if (supabaseConfigured && !VAPID_PUBLIC_KEY) {
  console.error('Missing VITE_VAPID_PUBLIC_KEY -- push notifications are disabled.')
}

/**
 * On iOS all three of these exist only inside a Home Screen web app -- never in a Safari tab --
 * so this doubles as the "is this installed (enough)?" check with no UA sniffing.
 */
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

// iPadOS 13+ reports itself as MacIntel; maxTouchPoints is the only reliable tell. Used ONLY to
// choose the wording of the "Add to Home Screen" hint, never to gate behavior.
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** base64url -> Uint8Array. Safari wants a BufferSource here, not the DOMString form. */
function urlBase64ToUint8Array(base64url) {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function rpcArgs(subscription, profileId) {
  const { endpoint, keys } = subscription.toJSON()
  return { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_profile: profileId }
}

/**
 * A subscription is permanently bound to the VAPID key it was created with -- after a key
 * rotation every push to it 403s forever, with no client-side symptom. Detect and reset.
 */
async function usableSubscription(registration) {
  const existing = await registration.pushManager.getSubscription()
  if (!existing) return null
  const bound = existing.options?.applicationServerKey // Safari may not populate options
  if (bound) {
    const current = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    const boundBytes = new Uint8Array(bound)
    const same =
      boundBytes.length === current.length && boundBytes.every((b, i) => b === current[i])
    if (!same) {
      await existing.unsubscribe()
      return null
    }
  }
  return existing
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  // updateViaCache:'none' -- GitHub Pages serves sw.js with max-age=600, and the update check
  // would otherwise be satisfied from the HTTP cache, delaying a fixed worker by up to ten
  // minutes on every client.
  navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch((error) => console.warn('Service worker registration failed', error))
}

/**
 * MUST be reachable from a click handler with no await in front of it. Safari drops the
 * user-gesture grant across an await, so `await navigator.serviceWorker.ready` before
 * requestPermission() makes the iOS prompt silently never appear -- no error, no prompt,
 * nothing. Every statement above the requestPermission() call below must stay synchronous.
 */
export async function enablePush(profileId) {
  if (!pushConfigured || !pushSupported() || !profileId) return 'unsupported'

  const permission = await Notification.requestPermission() // <- nothing awaited before this
  if (permission !== 'granted') return permission // 'denied' | 'default'

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await usableSubscription(registration)) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const { error } = await supabase.rpc('push_subscribe', rpcArgs(subscription, profileId))
  if (error) {
    // Leave the browser subscription in place -- syncSubscription() retries on next boot.
    console.warn('Could not save push subscription', error)
    return 'error'
  }
  return 'granted'
}

export async function disablePush() {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const { endpoint } = subscription.toJSON()
  await subscription.unsubscribe()
  await supabase.rpc('push_unsubscribe', { p_endpoint: endpoint })
}

/**
 * Boot-time reconciliation. Cheap and idempotent, and it's what actually repairs the two things
 * that would otherwise silently rot: a browser-rotated endpoint, and a device whose row still
 * names the profile that was selected when it first subscribed (switch profile on a shared
 * device and the exclusion logic goes wrong both ways). pushsubscriptionchange is unreliable in
 * Chrome and absent on iOS, so this carries the weight instead.
 */
export async function syncSubscription(profileId) {
  if (!pushConfigured || !pushSupported() || !profileId) return
  if (Notification.permission !== 'granted') return
  const registration = await navigator.serviceWorker.ready
  const subscription = await usableSubscription(registration)
  if (!subscription) return
  await supabase.rpc('push_subscribe', rpcArgs(subscription, profileId))
}

/**
 * Fire-and-forget on purpose. A cold Edge Function can take a second or two, and the night is
 * already booked and on screen by the time this runs -- blocking the dialog close on a
 * notification would make a working booking feel broken. Failures are console-only: they must
 * not reach planError, which renders "Couldn't reach movie night plans" and would be a lie about
 * what actually failed.
 */
export function notifyNightBooked(nightId) {
  if (!supabaseConfigured) return
  supabase.functions
    .invoke('notify-night', { body: { nightId } })
    .then(({ error }) => error && console.warn('notify-night failed', error))
    .catch((error) => console.warn('notify-night failed', error))
}
