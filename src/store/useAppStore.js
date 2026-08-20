import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    (set) => ({
      profiles: [],
      profilesLoading: true,
      profilesError: null,
      currentProfileId: null,

      // Fetches the shared profile list once and keeps it live via realtime inserts.
      // Guarded so React StrictMode's double-effect in dev doesn't double-subscribe.
      initProfiles: async () => {
        if (subscribed) return
        subscribed = true

        if (!supabaseConfigured) {
          set({ profilesLoading: false, profilesError: 'Supabase is not configured yet.' })
          return
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, avatar')
          .order('created_at', { ascending: true })

        set({
          profiles: data ?? [],
          profilesLoading: false,
          profilesError: error ? error.message : null,
        })

        supabase
          .channel('profiles-changes')
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
          .subscribe()
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

      selectProfile: (id) => set({ currentProfileId: id }),

      // Back to the "Who's watching?" screen, Netflix-style.
      signOut: () => set({ currentProfileId: null }),
    }),
    {
      name: 'party-cinema',
      version: 2,
      partialize: (state) => ({ currentProfileId: state.currentProfileId }),
    }
  )
)

/** The selected profile object, or null. */
export const useCurrentProfile = () =>
  useAppStore(
    (state) => state.profiles.find((profile) => profile.id === state.currentProfileId) ?? null
  )
