// Simple Icons' YouTube glyph (MIT licensed) -- a single-color path, styled via currentColor.
const YOUTUBE_ICON_PATH =
  'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'

/**
 * Opens a YouTube search for "<title> <year>" in a new tab. Deliberately not a real trailer URL:
 * RT's own scraped data (this project's only source) doesn't carry one, and YouTube's own top
 * result is reliably the trailer for anything with real search volume -- a search is as good as a
 * direct link for the catalog's mainstream titles, without maintaining a second data source (or
 * going stale the way a saved video id would if it's ever taken down).
 */
export default function TrailerLink({ title, year }) {
  const query = new URLSearchParams({ search_query: year ? `${title} ${year}` : title })

  return (
    <a
      href={`https://www.youtube.com/results?${query}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Search YouTube for the ${title} trailer`}
      title="Search for trailer"
      onClick={(event) => event.stopPropagation()}
      className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full bg-black/60 text-red-500 backdrop-blur-sm hover:bg-black/80"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
        <path d={YOUTUBE_ICON_PATH} />
      </svg>
    </a>
  )
}
