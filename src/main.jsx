import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import '@/index.css'
import { registerServiceWorker } from '@/lib/push'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Outside React: StrictMode double-invokes effects and this isn't React state. Deferred to
// `load` so it doesn't compete with the initial bundle fetch.
window.addEventListener('load', registerServiceWorker)
