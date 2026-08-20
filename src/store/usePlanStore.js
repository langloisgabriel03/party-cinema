import { create } from 'zustand'

import { supabase, supabaseConfigured } from '@/lib/supabaseClient'

/**
 * Shared watchlist (votes: one row per movie+person) and scheduled movie nights. One store for
 * both -- same domain, one realtime channel, one guard, and the Dashboard needs both together.
 * Deliberately separate from useAppStore: that store is wrapped in `persist`, and putting shared
 * server state inside a persisted store means either persisting it too (a stale localStorage
 * copy fighting realtime on rehydrate is a nasty bug class) or permanently maintaining an
 * exclusion list. Not persisted here at all -- refetched on load/reconnect, like the movie catalog.
 */
let subscribed = false

function indexWatchlist(items) {
  const map = new Map()
  for (const item of items) {
    const list = map.get(item.movie_id) ?? []
    list.push(item.added_by)
    map.set(item.movie_id, list)
  }
  return map
}

// watchlistByMovie is derived and must be rebuilt on every write, never computed in a selector:
// an allocating selector (`useStore(s => group(s.items))`) returns a fresh reference every call,
// so Object.is never matches and consumers re-render on every store update. Routed through one
// helper so the array and its index can never drift apart.
function setWatchlist(set, items) {
  set({ watchlist: items, watchlistByMovie: indexWatchlist(items) })
}

async function fetchWatchlist() {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('movie_id, added_by, created_at')
  if (error) throw error
  return data
}

async function fetchNights() {
  const { data, error } = await supabase
    .from('nights')
    .select('*')
    .order('scheduled_for', { ascending: true })
  if (error) throw error
  return data
}

export const usePlanStore = create((set, get) => ({
  watchlist: [],
  watchlistByMovie: new Map(),
  nights: [],
  planLoading: true,
  planError: null,

  // Full idempotent replacement -- safe to call any time (reconnect, tab refocus, after an
  // error) without a `fetched` guard, unlike the movie catalog's one-shot fetch.
  refreshPlan: async () => {
    try {
      const [watchlist, nights] = await Promise.all([fetchWatchlist(), fetchNights()])
      setWatchlist(set, watchlist)
      set({ nights, planLoading: false, planError: null })
    } catch (error) {
      set({ planLoading: false, planError: error.message })
    }
  },

  initPlan: () => {
    if (subscribed) return
    subscribed = true

    if (!supabaseConfigured) {
      set({ planLoading: false, planError: 'Supabase is not configured yet.' })
      return
    }

    // Subscribe BEFORE fetching (unlike useAppStore's profiles subscription): the initial fetch
    // happens in the SUBSCRIBED callback below, which fires on first connect AND every
    // auto-reconnect -- closing both the "event landed between fetch and subscribe" window and
    // the "phone backgrounded, socket died" drift. Safe because refreshPlan() is a full replace.
    supabase
      .channel('plan-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watchlist_items' }, ({ new: row }) => {
        // Supabase echoes our own writes back -- every handler must be idempotent.
        const current = get().watchlist
        if (current.some((item) => item.movie_id === row.movie_id && item.added_by === row.added_by)) return
        setWatchlist(set, [...current, row])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'watchlist_items' }, ({ old: row }) => {
        // Default replica identity: `old` carries only the PK columns -- exactly (movie_id,
        // added_by), which is what local rows are keyed on. Number() guards a bigint arriving
        // as a string never failing to match a numeric id already in state.
        const movieId = Number(row.movie_id)
        setWatchlist(
          set,
          get().watchlist.filter((item) => !(item.movie_id === movieId && item.added_by === row.added_by))
        )
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nights' }, ({ new: row }) => {
        const current = get().nights
        if (current.some((night) => night.id === row.id)) return
        set({ nights: [...current, row] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nights' }, ({ new: row }) => {
        // `new` is the complete post-update row -- replace-by-id is correct, no merge needed.
        set({ nights: get().nights.map((night) => (night.id === row.id ? row : night)) })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'nights' }, ({ old: row }) => {
        set({ nights: get().nights.filter((night) => night.id !== row.id) })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') get().refreshPlan()
        if (status === 'CHANNEL_ERROR') set({ planError: 'Realtime connection lost.' })
      })

    // iOS Safari kills WebSockets aggressively on backgrounding -- reconcile on refocus.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') get().refreshPlan()
    })
  },

  toggleWatchlist: async (movieId, profileId) => {
    const previous = get().watchlist
    const wanted = previous.some((item) => item.movie_id === movieId && item.added_by === profileId)

    // Optimistic: the tap must feel instant on a phone. Our own write echoes back over realtime
    // ~100ms later and is deduped by the handlers above.
    setWatchlist(
      set,
      wanted
        ? previous.filter((item) => !(item.movie_id === movieId && item.added_by === profileId))
        : [...previous, { movie_id: movieId, added_by: profileId, created_at: new Date().toISOString() }]
    )

    const { error } = wanted
      ? await supabase.from('watchlist_items').delete().eq('movie_id', movieId).eq('added_by', profileId)
      : await supabase.from('watchlist_items').insert({ movie_id: movieId, added_by: profileId })

    // 23505 = unique violation: a double-tap race already created the row server-side. The
    // desired end state is exactly what's on screen, so rolling back here would be the bug.
    if (error && error.code !== '23505') {
      setWatchlist(set, previous)
      set({ planError: error.message })
    }
  },

  scheduleNight: async ({ scheduledFor, startTime, note, createdBy, movieId }) => {
    const { data, error } = await supabase
      .from('nights')
      .insert({
        scheduled_for: scheduledFor,
        start_time: startTime || null,
        note: note || null,
        created_by: createdBy ?? null,
        movie_id: movieId ?? null,
      })
      .select()
      .single()
    if (error) {
      set({ planError: error.message })
      return null
    }
    const current = get().nights
    if (!current.some((night) => night.id === data.id)) set({ nights: [...current, data] })
    return data
  },

  updateNight: async (id, patch) => {
    const previous = get().nights
    set({ nights: previous.map((night) => (night.id === id ? { ...night, ...patch } : night)) })
    const { error } = await supabase.from('nights').update(patch).eq('id', id)
    if (error) set({ nights: previous, planError: error.message })
  },

  deleteNight: async (id) => {
    const previous = get().nights
    set({ nights: previous.filter((night) => night.id !== id) })
    const { error } = await supabase.from('nights').delete().eq('id', id)
    if (error) set({ nights: previous, planError: error.message })
  },
}))
