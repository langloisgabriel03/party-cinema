import { supabase } from '@/lib/supabaseClient'

const PAGE = 1000

// Ordered by year desc (id desc as a tiebreak) so the FIRST page already matches the default UI
// sort (Year, newest first) -- rows that stream in later only extend the list under that default
// view, they never need to reshuffle what's already rendered.
function fetchPage(from) {
  return supabase
    .from('movies')
    .select('*')
    .order('year', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE - 1)
}

export async function fetchFirstMoviesPage() {
  const { data, error } = await fetchPage(0)
  if (error) throw error
  return data
}

// Page count is discovered via an exact count, not a hardcoded cap -- an earlier version fixed
// this at 10 pages (10,000 rows), sized for the ~5,851-row catalog at the time. That silently
// truncated the catalog once a broader RT-sitemap scrape grew it past 10,000: rows beyond the
// cap were simply never fetched, with nothing in the UI to indicate the list was incomplete.
// Fired together, after the first page is already rendering, so the initial paint isn't blocked
// on the whole multi-MB catalog.
export async function fetchRemainingMoviesPages() {
  const { count, error: countError } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true })
  if (countError) throw countError

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE))
  const pages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchPage((i + 1) * PAGE))
  )
  for (const page of pages) if (page.error) throw page.error
  return pages.flatMap((page) => page.data)
}
