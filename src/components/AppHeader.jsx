import { Link } from 'react-router-dom'

/** Shared top bar: brand mark left (links to the dashboard), page-specific actions right. */
export default function AppHeader({ children, sticky = false }) {
  return (
    <header
      className={`flex items-center justify-between bg-ink px-6 py-5 sm:px-10 ${
        sticky ? 'sticky top-0 z-10' : ''
      }`}
    >
      <Link
        to="/dashboard"
        className="text-lg font-black tracking-tight text-brand transition-opacity hover:opacity-80 sm:text-xl"
      >
        PARTY CINEMA
      </Link>
      <div className="flex items-center gap-4">{children}</div>
    </header>
  )
}
