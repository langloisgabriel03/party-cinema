import { useEffect } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'

import Bracket from '@/pages/Bracket'
import Dashboard from '@/pages/Dashboard'
import Games from '@/pages/Games'
import Movies from '@/pages/Movies'
import ProfileSelect from '@/pages/ProfileSelect'
import Roulette from '@/pages/Roulette'
import { useAppStore } from '@/store/useAppStore'

/** Everything past the profile screen needs a selected profile. */
function RequireProfile({ children }) {
  const loading = useAppStore((state) => state.profilesLoading)
  const hasProfile = useAppStore((state) =>
    state.profiles.some((profile) => profile.id === state.currentProfileId)
  )

  // Don't redirect while the shared profile list is still loading -- a refreshed /dashboard
  // would otherwise briefly bounce to "/" before the current profile is found.
  if (loading) return null
  return hasProfile ? children : <Navigate to="/" replace />
}

const router = createBrowserRouter(
  [
    { path: '/', element: <ProfileSelect /> },
    {
      path: '/dashboard',
      element: (
        <RequireProfile>
          <Dashboard />
        </RequireProfile>
      ),
    },
    {
      path: '/movies',
      element: (
        <RequireProfile>
          <Movies />
        </RequireProfile>
      ),
    },
    {
      path: '/games',
      element: (
        <RequireProfile>
          <Games />
        </RequireProfile>
      ),
    },
    {
      path: '/roulette',
      element: (
        <RequireProfile>
          <Roulette />
        </RequireProfile>
      ),
    },
    {
      path: '/bracket',
      element: (
        <RequireProfile>
          <Bracket />
        </RequireProfile>
      ),
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL }
)

export default function App() {
  const initProfiles = useAppStore((state) => state.initProfiles)

  useEffect(() => {
    initProfiles()
  }, [initProfiles])

  return <RouterProvider router={router} />
}
