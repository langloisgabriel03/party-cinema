import { supabase } from '@/lib/supabaseClient'

const PAGE = 1000 // Supabase caps a REST page at 1000 rows; asking for more silently returns 1000.

// How many pages are in flight at once. The whole remainder used to be fired as one
// Promise.all -- at 31k rows that's 31 simultaneous sorts of the full table, and under any load
// (a phone on mobile data holding each connection open longer, someone else using the app) some
// come back "canceling statement due to statement timeout" and the catalog fails to load.
//
// Six, measured against the live catalog rather than guessed: 4 took 4.2s and 8 took 3.6s with a
// 1.5s worst batch, while 6 came in at 2.9s with a 0.6s worst batch. Past that the extra
// requests just queue behind each other and make one unlucky batch the whole wait.
const CONCURRENCY = 6

/**
 * Only the columns the app actually reads.
 *
 * `select('*')` also pulled synopsis (by far the largest), slug, decade, countries,
 * letterboxd_url, rt_url, rt_last_refreshed, data_sources and synced_at -- not one of which is
 * referenced by any component, filter or sort. Measured against the live catalog (31,428 rows):
 * 1089 KB per 1000 rows with `*`, 519 KB with this list. Over the whole catalog that is 33.4 MB
 * a session versus 15.9 MB.
 *
 * Keep this in step with what the UI reads: a column missing here is `undefined` at the card,
 * not a crash, so the failure is quiet. `cast` and `director` are here for the search index
 * rather than for display.
 */
export const MOVIE_COLUMNS =
  'id,title,year,poster,genres,lists,franchise,tomatometer,audience_score,' +
  'critic_review_count,audience_rating_count,runtime_minutes,director,cast'

// Ordered by year desc (id desc as a tiebreak) so the FIRST page already matches the default UI
// sort (Year, newest first) -- rows that stream in later only extend the list under that default
// view, they never need to reshuffle what's already rendered.
function fetchPage(from) {
  return supabase
    .from('movies')
    .select(MOVIE_COLUMNS)
    .order('year', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE - 1)
}

export async function fetchFirstMoviesPage() {
  const { data, error } = await fetchPage(0)
  if (error) throw error
  return data
}

/**
 * Everything after page 1, handed to `onBatch` as it arrives rather than returned in one lump --
 * at 31k rows the difference is the grid growing every second or so instead of sitting at 1000
 * for the best part of a minute.
 *
 * Batches are awaited in order, so appended rows stay in the year-desc order page 1 established
 * and the list never reshuffles under the reader.
 *
 * Page count is discovered via an exact count, not a hardcoded cap -- an earlier version fixed
 * this at 10 pages (10,000 rows), sized for the ~5,851-row catalog at the time. That silently
 * truncated the catalog once a broader RT-sitemap scrape grew it past 10,000: rows beyond the
 * cap were simply never fetched, with nothing in the UI to indicate the list was incomplete.
 */
export async function fetchRemainingMoviesPages(onBatch) {
  const { count, error: countError } = await supabase
    .from('movies')
    .select('id', { count: 'exact', head: true })
  if (countError) throw countError

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE))
  const offsets = Array.from({ length: totalPages - 1 }, (_, i) => (i + 1) * PAGE)

  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = await Promise.all(offsets.slice(i, i + CONCURRENCY).map(fetchPage))
    for (const page of batch) if (page.error) throw page.error
    onBatch(batch.flatMap((page) => page.data))
  }
}

/**
 * Title search run by Postgres instead of by MiniSearch over rows we haven't downloaded yet.
 *
 * The point is latency, not better matching: the local index is the better search once the
 * catalog is in memory (it covers cast and director, and ranks), but until then it can only find
 * what has already streamed in -- so searching for a film sitting in page 20 of 32 showed
 * nothing at all for the better part of a minute. This answers in 150-500ms against the
 * movies_title_trgm index, regardless of how much has loaded.
 */
export async function searchMovieTitles(query, limit = 40) {
  const { data, error } = await supabase
    .from('movies')
    .select(MOVIE_COLUMNS)
    .ilike('title', `%${query}%`)
    .order('year', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}
