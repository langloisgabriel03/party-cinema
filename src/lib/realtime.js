import { supabase } from '@/lib/supabaseClient'

/**
 * A realtime channel that survives a phone going to sleep.
 *
 * Mobile Safari kills the WebSocket when the app is backgrounded, and the naive handling of that
 * (re-subscribe on visibilitychange, show an error on CHANNEL_ERROR) left people staring at
 * "Realtime connection lost" until they reloaded. Four separate reasons, all fixed here:
 *
 *  1. RE-USING THE TOPIC NAME. supabase-js keys channels by topic and removeChannel() is async,
 *     so subscribing `plan-changes` again before the old one finished tearing down failed
 *     immediately -- the reconnect itself was what produced the error. Every attempt now gets a
 *     fresh unique topic.
 *  2. ONE SHOT, NO RETRY. If the single attempt on resume failed (radio still coming back after
 *     unlock, which is exactly when this runs), nothing tried again until the next time the app
 *     was backgrounded and reopened. Now it retries with backoff.
 *  3. STALE CALLBACKS. A dead channel's subscribe callback still fires after it's replaced, and
 *     its CLOSED/ERROR would knock over the healthy channel that replaced it. Each attempt
 *     carries a generation token and late callbacks from older generations are ignored.
 *  4. visibilitychange ONLY. iOS restores pages from the back/forward cache with `pageshow`, and
 *     a network change fires `online`, neither of which is a visibility change.
 *
 * `onDown` is deliberately not called on the first failure: a wobble while the radio wakes up is
 * normal and self-heals within a second or two, and flashing an error banner at that is noise.
 */
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30_000
const FAILURES_BEFORE_REPORTING = 3

export function createResilientChannel({ name, bind, onSubscribed, onDown }) {
  let channel = null
  let generation = 0
  let failures = 0
  let timer = null
  let started = false

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const connect = () => {
    clearTimer()
    generation += 1
    const mine = generation

    if (channel) {
      // Fire-and-forget: we never re-use this topic, so we don't need to wait for teardown.
      supabase.removeChannel(channel)
      channel = null
    }

    // Unique per attempt -- see reason 1 above.
    channel = bind(supabase.channel(`${name}-${mine}-${Date.now()}`))
    channel.subscribe((status) => {
      if (mine !== generation) return // superseded; ignore (reason 3)
      if (status === 'SUBSCRIBED') {
        failures = 0
        onSubscribed?.()
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleRetry()
      }
    })
  }

  const scheduleRetry = () => {
    clearTimer()
    failures += 1
    if (failures >= FAILURES_BEFORE_REPORTING) onDown?.()
    const delay = Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS)
    timer = setTimeout(connect, delay)
  }

  /** Resume: reset the backoff and try immediately -- the user is looking at the screen now. */
  const revive = () => {
    failures = 0
    connect()
  }

  return {
    start() {
      if (started) return
      started = true
      connect()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') revive()
      })
      // bfcache restore on iOS doesn't necessarily fire visibilitychange (reason 4).
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) revive()
      })
      window.addEventListener('online', revive)
    },
  }
}
