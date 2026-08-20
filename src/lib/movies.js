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

// Generous headroom above the ~6 pages the current ~5,851-row catalog needs -- trailing empty
// ranges just resolve to []. Fired together, after the first page is already rendering, so the
// initial paint isn't blocked on the whole ~7MB catalog.
const MAX_PAGES = 10

export async function fetchRemainingMoviesPages() {
  const pages = await Promise.all(
    Array.from({ length: MAX_PAGES - 1 }, (_, i) => fetchPage((i + 1) * PAGE))
  )
  for (const page of pages) if (page.error) throw page.error
  return pages.flatMap((page) => page.data)
}
