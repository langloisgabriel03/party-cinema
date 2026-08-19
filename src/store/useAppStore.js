import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The single app store. Today it only holds profiles; the watchlist (`movies`) and the
 * scheduled nights (`nights`) belong here too when we build them.
 *
 * Persisted to localStorage, which means each browser keeps its OWN copy — friends will not
 * see each other's data. Swapping this file for a real backend (Supabase) is the fix.
 */
const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const useAppStore = create(
  persist(
    (set) => ({
      profiles: [],
      currentProfileId: null,

      addProfile: (name, avatar) => {
        const profile = { id: createId(), name: name.trim(), avatar }
        set((state) => ({ profiles: [...state.profiles, profile] }))
        return profile
      },

      removeProfile: (id) =>
        set((state) => ({
          profiles: state.profiles.filter((profile) => profile.id !== id),
          currentProfileId: state.currentProfileId === id ? null : state.currentProfileId,
        })),

      selectProfile: (id) => set({ currentProfileId: id }),

      // Back to the "Who's watching?" screen, Netflix-style.
      signOut: () => set({ currentProfileId: null }),
    }),
    {
      name: 'party-cinema',
      version: 1,
    }
  )
)

/** The selected profile object, or null. */
export const useCurrentProfile = () =>
  useAppStore(
    (state) => state.profiles.find((profile) => profile.id === state.currentProfileId) ?? null
  )
