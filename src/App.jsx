import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'

import Dashboard from '@/pages/Dashboard'
import ProfileSelect from '@/pages/ProfileSelect'
import { useAppStore } from '@/store/useAppStore'

/** Everything past the profile screen needs a selected profile. */
function RequireProfile({ children }) {
  const hasProfile = useAppStore((state) =>
    state.profiles.some((profile) => profile.id === state.currentProfileId)
  )

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
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  // Keeps routes path-clean under the /party-cinema/ GitHub Pages subpath.
  { basename: import.meta.env.BASE_URL }
)

export default function App() {
  return <RouterProvider router={router} />
}
