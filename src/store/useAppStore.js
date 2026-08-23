import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { createResilientChannel } from '@/lib/realtime'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'

/**
 * `profiles` is shared across everyone via Supabase (see README). The movie catalog
 * (`useMovieCatalogStore`) and the shared watchlist/nights (`usePlanStore`) deliberately live in
 * their own stores, not here -- this store is wrapped in `persist`, and shared server state
 * inside a persisted store means either persisting it too (a stale localStorage copy fighting
 * realtime on rehydrate is a nasty bug class) or permanently maintaining an exclusion list.
 *
 * `currentProfileId` stays in localStorage: which profile *this browser* is using is a per-device
 * choice, same as Netflix, not shared data -- so it's the only thing persisted.
 */
let subscribed = false

export const useAppStore = create(
  persist(
    (set, get) => ({
      profiles: [],
      profilesLoading: true,
      profilesError: null,
      currentProfileId: null,
      pushPromptDismissed: false,

      // Fetches the shared profile list once and keeps it live via realtime inserts.
      // Guarded so React StrictMode's double-effect in dev doesn't double-subscribe.
      initProfiles: async () => {
        if (subscribed) return
        subscribed = true

        if (!supabaseConfigured) {
          set({ profilesLoading: false, profilesError: 'Supabase is not configured yet.' })
          return
        }

        const fetchProfiles = async () => {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, name, avatar')
            .order('created_at', { ascending: true })
          set({
            profiles: data ?? [],
            profilesLoading: false,
            profilesError: error ? error.message : null,
          })
        }
        await fetchProfiles()

        // Reconnects after the phone sleeps, same as the other two stores -- this channel used
        // to be subscribed once and never revived, so a profile added or a picture changed while
        // the app was backgrounded stayed invisible until a reload.
        createResilientChannel({
          name: 'profiles-changes',
          bind: (channel) =>
            channel
              .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'profiles' },
                ({ new: row }) =>
                  set((state) =>
                    state.profiles.some((profile) => profile.id === row.id)
                      ? state
                      : { profiles: [...state.profiles, row] }
                  )
              )
              .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles' },
                // Without this, a changed profile picture wouldn't reach anyone else's open tab
                // until they reloaded. `new` is the complete post-update row, so replace-by-id
                // is correct.
                ({ new: row }) =>
                  set((state) => ({
                    profiles: state.profiles.map((profile) => (profile.id === row.id ? row : profile)),
                  }))
              ),
          // Re-fetch on every (re)connect to catch anything missed while the socket was down.
          onSubscribed: fetchProfiles,
          // And instantly on resume, over plain REST -- doesn't wait on the socket. Same fix as
          // usePlanStore's onResume, applied here so a profile picture changed while this phone
          // was asleep shows up the moment the app is reopened, not whenever the socket catches up.
          onResume: fetchProfiles,
          // No onDown: the profile list is near-static and already on screen, so an outage here
          // has nothing useful to tell the user.
        }).start()
      },

      addProfile: async (name, avatar) => {
        if (!supabaseConfigured) {
          set({ profilesError: 'Supabase is not configured yet.' })
          return null
        }

        const { data, error } = await supabase
          .from('profiles')
          .insert({ name: name.trim(), avatar })
          .select('id, name, avatar')
          .single()

        if (error) {
          set({ profilesError: error.message })
          return null
        }

        set((state) =>
          state.profiles.some((profile) => profile.id === data.id)
            ? state
            : { profiles: [...state.profiles, data] }
        )
        return data
      },

      // Optimistic, then reconciled by the UPDATE realtime handler above (which also carries the
      // change to everyone else's open tab). Needs the UPDATE policy from profiles_update.sql --
      // without it the write matches no policy, affects zero rows, and reports no error.
      //
      // Returns the failure instead of setting profilesError: that field renders as "Couldn't
      // reach the shared profile list", which would be a lie about what actually broke. The
      // caller shows it where the action happened.
      updateProfileAvatar: async (id, avatar) => {
        const previous = get().profiles
        set({
          profiles: previous.map((profile) => (profile.id === id ? { ...profile, avatar } : profile)),
        })

        const { data, error } = await supabase
          .from('profiles')
          .update({ avatar })
          .eq('id', id)
          .select('id, name, avatar')

        if (error) {
          set({ profiles: previous })
          return { ok: false, error: error.message }
        }
        // Zero rows back means RLS silently dropped it -- surface that rather than leaving the
        // optimistic value on screen pretending it saved.
        if (!data?.length) {
          set({ profiles: previous })
          return { ok: false, error: 'Could not save — has profiles_update.sql been run in Supabase?' }
        }
        return { ok: true }
      },

      selectProfile: (id) => set({ currentProfileId: id }),

      // Back to the "Who's watching?" screen, Netflix-style.
      signOut: () => set({ currentProfileId: null }),

      dismissPushPrompt: () => set({ pushPromptDismissed: true }),
    }),
    {
      name: 'party-cinema',
      version: 2,
      // No version bump needed for the new key: zustand's default merge shallow-overlays
      // persisted state onto the initial state, so an existing localStorage blob that only
      // carries currentProfileId just falls back to the initial value (false) for this one.
      partialize: (state) => ({
        currentProfileId: state.currentProfileId,
        pushPromptDismissed: state.pushPromptDismissed,
      }),
    }
  )
)

/** The selected profile object, or null. */
export const useCurrentProfile = () =>
  useAppStore(
    (state) => state.profiles.find((profile) => profile.id === state.currentProfileId) ?? null
  )
