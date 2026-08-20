import { supabase } from '@/lib/supabaseClient'

// PostgREST caps responses at 1000 rows by default -- fetch the first page with an exact count,
// then fire the remaining pages in parallel (faster than a sequential loop on cellular).
// Ordered by `id` since .range() pagination needs a stable sort key across requests.
const PAGE = 1000

export async function fetchAllMovies() {
  const first = await supabase
    .from('movies')
    .select('*', { count: 'exact' })
    .order('id', { ascending: true })
    .range(0, PAGE - 1)

  if (first.error) throw first.error

  const total = first.count ?? first.data.length
  const remainingPages = Math.ceil(Math.max(0, total - PAGE) / PAGE)

  const rest = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) => {
      const from = PAGE * (i + 1)
      return supabase
        .from('movies')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
    })
  )

  for (const page of rest) {
    if (page.error) throw page.error
  }

  return [...first.data, ...rest.flatMap((page) => page.data)]
}
