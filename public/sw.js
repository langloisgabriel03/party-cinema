/* Party Cinema service worker -- deliberately cache-free.
 *
 * Served verbatim from public/ (Vite does not transform this file), which puts it at
 * https://tooning.co/sw.js and therefore at root scope. It has exactly one job: turn a
 * push message into a notification.
 *
 * It must never cache anything. GitHub Pages replaces the whole dist/ on every deploy, so a
 * precached index.html would pin hashed asset URLs that no longer exist -- a white screen for
 * everyone until they manually clear site data. If this ever grows a Workbox/vite-plugin-pwa
 * caching layer, that is the failure mode being signed up for.
 */

// No fetch handler. Chrome dropped the fetch-handler requirement for installability in 108
// (mobile) / 112 (desktop), and there's no offline story to gate on it. If one is ever added,
// make it `() => {}` -- never `e.respondWith(fetch(e.request))`, which quietly breaks range
// requests and aborts.

// Safe here precisely because nothing is cached: a new worker can never take over a page that
// was loaded with assets it disagrees with. Without these, a broken sw.js keeps controlling
// every open tab until all of them are closed.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  // Permission was granted under userVisibleOnly:true, so EVERY push must result in a visible
  // notification. Swallow a malformed payload and show something generic rather than throwing --
  // a silent push earns a "this site was updated in the background" notice from Chrome, and
  // repeat offences get the permission revoked.
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  // The film's poster, when notify-night found one for the night.
  const poster = payload.image

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Party Cinema', {
      body: payload.body || 'A movie night was booked.',
      // No `icon` on purpose. It renders as a SQUARE thumbnail on the right of the collapsed
      // notification, and a 2:3 poster put there comes out visibly stretched. It can't be fixed:
      // the poster host (a.ltrbxd.com) sends no CORS headers, so the pixels can't be read to
      // center-crop them in this worker, and the CDN only serves 2:3 renditions -- asking it for
      // a square returns a placeholder. Setting it to the app icon instead was the original bug:
      // our mark then appeared twice, once here and once as the badge. So the collapsed form is
      // badge + text, and the poster shows undistorted as the large `image` when expanded.
      badge: '/icons/icon-192.png', // small monochrome mark, Android status bar only
      // Large image in the EXPANDED notification (Android/desktop Chrome; iOS Safari's web push
      // doesn't render `image` at all, so this is a no-op there, not a bug). Only set when there
      // is one -- an empty src shows a broken-image icon instead of just omitting the picture.
      ...(poster ? { image: poster } : {}),
      tag: payload.tag || 'party-cinema', // same night replaces rather than stacks
      data: { url: payload.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue
        await client.focus()
        // navigate() rejects on a client this worker doesn't control, and is a no-op on some
        // iOS builds -- focusing is the part that matters, so never let it throw.
        if ('navigate' in client) await client.navigate(target.href).catch(() => {})
        return
      }
      await self.clients.openWindow(target.href)
    })()
  )
})
