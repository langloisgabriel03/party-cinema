/** Shared top bar: brand mark left, page-specific actions right. Used by every page past ProfileSelect. */
export default function AppHeader({ children, sticky = false }) {
  return (
    <header
      className={`flex items-center justify-between bg-ink px-6 py-5 sm:px-10 ${
        sticky ? 'sticky top-0 z-10' : ''
      }`}
    >
      <span className="text-lg font-black tracking-tight text-brand sm:text-xl">PARTY CINEMA</span>
      <div className="flex items-center gap-4">{children}</div>
    </header>
  )
}
