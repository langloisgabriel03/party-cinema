/**
 * Opens a 1337x search (sorted by size, descending) for "<title> <year>" in a new tab -- same
 * query shape as rt-dashboard's own Movie Library page (pages/1_Movie_Library.py), so a title
 * found here searches the same way it would there.
 */
export default function MagnetLink({ title, year }) {
  const query = encodeURIComponent(year ? `${title} ${year}` : title)

  return (
    <a
      href={`https://1337x.to/sort-search/${query}/size/desc/1/`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Search 1337x for ${title}`}
      title="Search for torrent"
      onClick={(event) => event.stopPropagation()}
      className="absolute bottom-1 left-1 flex size-9 items-center justify-center rounded-full bg-black/60 text-base backdrop-blur-sm hover:bg-black/80"
    >
      🧲
    </a>
  )
}
