import { create } from 'zustand'

import { createResilientChannel } from '@/lib/realtime'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'

/**
 * Shared watchlist (votes: one row per movie+person), scheduled movie nights, and which film(s)
 * are attached to each night (also a vote-shaped join, night+movie). One store for all three --
 * same domain, one realtime channel, one guard, and the Dashboard needs all of them together.
 * Deliberately separate from useAppStore: that store is wrapped in `persist`, and putting shared
 * server state inside a persisted store means either persisting it too (a stale localStorage
 * copy fighting realtime on rehydrate is a nasty bug class) or permanently maintaining an
 * exclusion list. Not persisted here at all -- refetched on load/reconnect, like the movie catalog.
 */
let subscribed = false

// Compared by identity when clearing, so a reconnect only clears its own message and never wipes
// a real error (a failed fetch) that happened to be showing.
const RECONNECTING = 'Realtime connection lost — retrying…'

function indexByFirst(items, firstKey, secondKey) {
  const map = new Map()
  for (const item of items) {
    const list = map.get(item[firstKey]) ?? []
    list.push(item[secondKey])
    map.set(item[firstKey], list)
  }
  return map
}

// Both *ByX indexes are derived and must be rebuilt on every write, never computed in a selector:
// an allocating selector (`useStore(s => group(s.items))`) returns a fresh reference every call,
// so Object.is never matches and consumers re-render on every store update. Routed through these
// helpers so an array and its index can never drift apart.
function setWatchlist(set, items) {
  set({ watchlist: items, watchlistByMovie: indexByFirst(items, 'movie_id', 'added_by') })
}
function setNightMovies(set, items) {
  set({ nightMovies: items, nightMoviesByNight: indexByFirst(items, 'night_id', 'movie_id') })
}

/** Same derived-index discipline: Map<night_id, rsvp[]>, rebuilt on every write, never in a selector. */
function setRsvps(set, items) {
  const byNight = new Map()
  for (const rsvp of items) {
    const list = byNight.get(rsvp.night_id) ?? []
    list.push(rsvp)
    byNight.set(rsvp.night_id, list)
  }
  set({ rsvps: items, rsvpsByNight: byNight })
}

async function fetchWatchlist() {
  const { data, error } = await supabase.from('watchlist_items').select('movie_id, added_by, created_at')
  if (error) throw error
  return data
}

async function fetchNights() {
  const { data, error } = await supabase.from('nights').select('*').order('scheduled_for', { ascending: true })
  if (error) throw error
  return data
}

async function fetchNightMovies() {
  const { data, error } = await supabase.from('night_movies').select('night_id, movie_id, added_by, created_at')
  if (error) throw error
  return data
}

async function fetchRsvps() {
  const { data, error } = await supabase.from('night_rsvps').select('night_id, profile_id, going')
  if (error) {
    // Manual paste-in-dashboard migration like the rest of the schema, so it can lag a deploy.
    // Treat a missing table as "nobody has replied" rather than failing the whole plan fetch.
    console.warn('night_rsvps fetch failed (has night_rsvps_schema.sql been run?):', error.message)
    return []
  }
  return data
}

async function fetchRouletteEntries() {
  const { data, error } = await supabase.from('roulette_entries').select('movie_id, added_by, created_at')
  if (error) {
    // roulette_schema.sql is a manual paste-in-dashboard migration, same as the rest of this
    // app's schema -- it can lag behind a deploy. Treat any failure here as "no entries yet"
    // rather than failing refreshPlan's Promise.all and taking watchlist/nights down with it.
    console.warn('roulette_entries fetch failed (has roulette_schema.sql been run?):', error.message)
    return []
  }
  return data
}

/** Wires every table handler onto a channel. Reconnection is createResilientChannel's job. */
function bindPlanHandlers(set, get, channel) {
  return channel
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'night_movies' }, ({ new: row }) => {
      const current = get().nightMovies
      if (current.some((nm) => nm.night_id === row.night_id && nm.movie_id === row.movie_id)) return
      setNightMovies(set, [...current, row])
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'night_movies' }, ({ old: row }) => {
      const movieId = Number(row.movie_id)
      setNightMovies(
        set,
        get().nightMovies.filter((nm) => !(nm.night_id === row.night_id && nm.movie_id === movieId))
      )
    })
    // '*' rather than separate handlers: an RSVP is upserted, so changing your mind arrives as an
    // UPDATE while a first reply arrives as an INSERT, and both mean the same thing here.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'night_rsvps' }, ({ eventType, new: row, old }) => {
      const current = get().rsvps
      if (eventType === 'DELETE') {
        setRsvps(
          set,
          current.filter((r) => !(r.night_id === old.night_id && r.profile_id === old.profile_id))
        )
        return
      }
      const index = current.findIndex(
        (r) => r.night_id === row.night_id && r.profile_id === row.profile_id
      )
      setRsvps(set, index === -1 ? [...current, row] : current.map((r, i) => (i === index ? row : r)))
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roulette_entries' }, ({ new: row }) => {
      const current = get().rouletteEntries
      if (current.some((item) => item.movie_id === row.movie_id && item.added_by === row.added_by)) return
      set({ rouletteEntries: [...current, row] })
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'roulette_entries' }, ({ old: row }) => {
      const movieId = Number(row.movie_id)
      set({
        rouletteEntries: get().rouletteEntries.filter(
          (item) => !(item.movie_id === movieId && item.added_by === row.added_by)
        ),
      })
    })
}

export const usePlanStore = create((set, get) => ({
  watchlist: [],
  watchlistByMovie: new Map(),
  nights: [],
  nightMovies: [],
  nightMoviesByNight: new Map(),
  rouletteEntries: [],
  rsvps: [],
  rsvpsByNight: new Map(),
  planLoading: true,
  planError: null,

  // Full idempotent replacement -- safe to call any time (reconnect, tab refocus, after an
  // error) without a `fetched` guard, unlike the movie catalog's one-shot fetch.
  refreshPlan: async () => {
    try {
      const [watchlist, nights, nightMovies, rouletteEntries, rsvps] = await Promise.all([
        fetchWatchlist(),
        fetchNights(),
        fetchNightMovies(),
        fetchRouletteEntries(),
        fetchRsvps(),
      ])
      setWatchlist(set, watchlist)
      setNightMovies(set, nightMovies)
      setRsvps(set, rsvps)
      set({ nights, rouletteEntries, planLoading: false, planError: null })
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

    // Fetch immediately, not only from the SUBSCRIBED callback below. Realtime is a live-update
    // luxury; the REST read is what actually puts data on screen. Hanging the only fetch off the
    // subscription meant that if the socket never came up (blocked network, captive wifi) the
    // app sat on "Loading movie night plans…" forever with an empty dashboard, even though every
    // REST call would have worked.
    get().refreshPlan()

    // Fetching again on SUBSCRIBED -- which fires on first connect AND every reconnect -- closes
    // both the "event landed between fetch and subscribe" window and the "phone was asleep,
    // socket died" drift. Safe to run repeatedly because refreshPlan is a full replace.
    createResilientChannel({
      name: 'plan-changes',
      bind: (channel) => bindPlanHandlers(set, get, channel),
      onSubscribed: () => {
        // Clear our own stale "connection lost" the moment we're actually back.
        if (get().planError === RECONNECTING) set({ planError: null })
        get().refreshPlan()
      },
      // Only after several consecutive failures -- a brief wobble while the radio wakes up is
      // normal and self-heals, and flashing a banner at that is what made this feel broken.
      onDown: () => set({ planError: RECONNECTING }),
    }).start()
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

  // Removes a movie from the watchlist entirely (every profile's vote for it), not just the
  // current profile's -- matches the app's "anyone can remove anything" permission model (no
  // auth, so "only the adder can remove it" would be politeness, not security; see plan_schema.sql).
  removeWatchlistMovie: async (movieId) => {
    const previous = get().watchlist
    setWatchlist(set, previous.filter((item) => item.movie_id !== movieId))
    const { error } = await supabase.from('watchlist_items').delete().eq('movie_id', movieId)
    if (error) {
      setWatchlist(set, previous)
      set({ planError: error.message })
    }
  },

  scheduleNight: async ({ scheduledFor, note, createdBy }) => {
    const { data, error } = await supabase
      .from('nights')
      .insert({ scheduled_for: scheduledFor, note: note || null, created_by: createdBy ?? null })
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

  deleteNight: async (id) => {
    const previous = get().nights
    set({ nights: previous.filter((night) => night.id !== id) })
    const { error } = await supabase.from('nights').delete().eq('id', id)
    if (error) set({ nights: previous, planError: error.message })
  },

  addMovieToNight: async (nightId, movieId, profileId) => {
    const previous = get().nightMovies
    if (previous.some((nm) => nm.night_id === nightId && nm.movie_id === movieId)) return
    setNightMovies(set, [
      ...previous,
      { night_id: nightId, movie_id: movieId, added_by: profileId, created_at: new Date().toISOString() },
    ])
    const { error } = await supabase
      .from('night_movies')
      .insert({ night_id: nightId, movie_id: movieId, added_by: profileId })
    if (error && error.code !== '23505') {
      setNightMovies(set, previous)
      set({ planError: error.message })
    }
  },

  removeMovieFromNight: async (nightId, movieId) => {
    const previous = get().nightMovies
    setNightMovies(set, previous.filter((nm) => !(nm.night_id === nightId && nm.movie_id === movieId)))
    const { error } = await supabase
      .from('night_movies')
      .delete()
      .eq('night_id', nightId)
      .eq('movie_id', movieId)
    if (error) {
      setNightMovies(set, previous)
      set({ planError: error.message })
    }
  },

  /**
   * `going` of null withdraws the reply entirely (back to "hasn't answered"), which is what
   * tapping the already-selected button does -- otherwise there'd be no way to undo a mis-tap
   * short of picking the wrong answer.
   */
  setRsvp: async (nightId, profileId, going) => {
    const previous = get().rsvps
    const without = previous.filter(
      (r) => !(r.night_id === nightId && r.profile_id === profileId)
    )
    setRsvps(set, going == null ? without : [...without, { night_id: nightId, profile_id: profileId, going }])

    const { error } =
      going == null
        ? await supabase.from('night_rsvps').delete().eq('night_id', nightId).eq('profile_id', profileId)
        : await supabase
            .from('night_rsvps')
            .upsert({ night_id: nightId, profile_id: profileId, going }, { onConflict: 'night_id,profile_id' })

    if (error) {
      setRsvps(set, previous)
      set({ planError: error.message })
    }
  },

  addToRoulette: async (movieId, profileId) => {
    const previous = get().rouletteEntries
    if (previous.some((item) => item.movie_id === movieId && item.added_by === profileId)) return
    set({
      rouletteEntries: [
        ...previous,
        { movie_id: movieId, added_by: profileId, created_at: new Date().toISOString() },
      ],
    })
    const { error } = await supabase.from('roulette_entries').insert({ movie_id: movieId, added_by: profileId })
    if (error && error.code !== '23505') {
      set({ rouletteEntries: previous, planError: error.message })
    }
  },

  // Scoped to one person's own entry, unlike removeWatchlistMovie's "anyone can remove anything".
  // The roulette is a game with a per-person cap, so pulling someone else's pick out of the pool
  // both loses them a slot they can't see they've lost and changes the odds mid-game.
  removeFromRoulette: async (movieId, profileId) => {
    const previous = get().rouletteEntries
    set({
      rouletteEntries: previous.filter(
        (item) => !(item.movie_id === movieId && item.added_by === profileId)
      ),
    })
    const { error } = await supabase
      .from('roulette_entries')
      .delete()
      .eq('movie_id', movieId)
      .eq('added_by', profileId)
    if (error) {
      set({ rouletteEntries: previous, planError: error.message })
    }
  },
}))
