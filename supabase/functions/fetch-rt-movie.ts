// fetch-rt-movie
//
// Kept here for version control, but DEPLOYED by pasting: Supabase dashboard -> Edge Functions
// -> Deploy a new function -> paste this file's contents -> Deploy. No local Supabase CLI is
// used for this project, no secrets required -- this function only makes an outbound fetch and
// parses the response, it never touches the database.
//
// Called as POST { url }. Fetches a Rotten Tomatoes movie or TV page and pulls out the same
// fields sync_to_supabase.py's local pipeline would, for the admin "add a movie by hand" flow on
// /movies (src/components/AddMovieDialog.jsx) -- covers a title that isn't on any of the curated
// lists the local scraper runs against yet (a brand new release, an obscure pick a friend wants
// added), without waiting on a full local re-scrape.
//
// This is a read-only scrape-and-return: it never writes to Supabase, and returns exactly what it
// found (nulls where a field wasn't there) for a human to review and correct before the client
// inserts anything -- see addManualMovie() in useMovieCatalogStore.js. Ported from rt-dashboard's
// rt_scraper.py (get_movie_from_url), which reads the same JSON blobs RT's own frontend uses to
// render the page rather than CSS classes/slot names, on the theory that internal data shape is
// less likely to shift under a redesign than markup is -- confirmed against a live page as of
// this writing (both the "media-hero-json" and "media-scorecard-json" blocks, and the ld+json
// schema.org block, all present and populated on both a movie and a TV page).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Same UA rt_scraper.py uses -- RT's own frontend expects a real browser, and this is a value
// already confirmed to work against the live site rather than a guess.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** Pulls `<script id="X" type="application/json">{...}</script>`'s JSON payload out of raw HTML. */
function findJsonScript(html: string, scriptId: string): Record<string, unknown> | null {
  const match = html.match(new RegExp(`id="${scriptId}"[^>]*>\\s*(\\{[\\s\\S]*?\\})\\s*</script>`))
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function findLdJson(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (!match) return {}
  try {
    return JSON.parse(match[1])
  } catch {
    return {}
  }
}

const YEAR_ONLY = /^\d{4}$/
// A duration-shaped token ("2h 10m", "58m", "2h") with the spaces stripped, distinguished from a
// TV page's "2 Seasons" (which has no h/m at all) or a rating ("R") purely by shape -- exactly
// rt_scraper.py's _classify_metadata_props, since metadataProps is positional but *variable
// length*: a rated film gives ['R', '2026', '1h 52m'], an unrated one gives just ['2005', '1h 35m'].
const DURATION_ONLY = /^(?:\d+h)?(?:\d+m)?$/i
const KNOWN_RATINGS = new Set([
  'G', 'PG', 'PG-13', 'R', 'NC-17', 'NR', 'UNRATED', 'M', 'M/PG', 'X', 'GP', 'APPROVED', 'PASSED',
  'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA',
])

/** (year, durationText) out of RT's positional-but-variable-length metadataProps list. */
function classifyMetadataProps(props: unknown): { year: string | null; duration: string | null } {
  let year: string | null = null
  let duration: string | null = null
  for (const raw of Array.isArray(props) ? props : []) {
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value) continue
    if (year === null && YEAR_ONLY.test(value)) year = value
    else if (
      duration === null &&
      DURATION_ONLY.test(value.replace(/\s+/g, '')) &&
      /\d/.test(value)
    ) {
      duration = value
    } else if (KNOWN_RATINGS.has(value.toUpperCase())) {
      // rating -- not stored in this app's schema, nothing to capture
    }
  }
  return { year, duration }
}

/** "2h 10m" / "58m" / "2h" -> minutes. */
function parseDurationToMinutes(duration: string | null): number | null {
  if (!duration) return null
  const match = duration.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i)
  if (!match || (!match[1] && !match[2])) return null
  const total = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)
  return total || null
}

/** RT's audience-count display string ('50,000+ Ratings') -> a floor int. See rt_scraper.py's
 * _parse_banded_count for why this (not scorecard.audienceScore.reviewCount) is the number that
 * matches what's actually shown on the page -- reviewCount undercounts it 5-25x. */
function parseBandedCount(banded: unknown): number | null {
  if (typeof banded !== 'string') return null
  const match = banded.trim().match(/^([\d,]+)\+?\s/)
  if (!match) return null
  const n = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const WRAPPED_IMAGE = /^https?:\/\/resizing\.flixster\.com\/[^/]+\/\d+x\d+\/v2\/(https?:\/\/.+)$/

/** Unwraps RT's thumbnail-sizing proxy down to the original image, then rewraps it at a size
 * actually sensible for a poster card (400x600) instead of a blurry thumbnail or a multi-MB
 * original -- see rt_scraper.py's _sized_poster_image for why the hash segment can be anything. */
function sizedPosterImage(url: string | null | undefined): string | null {
  let current = url ?? null
  while (current) {
    const match = current.match(WRAPPED_IMAGE)
    if (!match) break
    current = match[1]
  }
  return current ? `https://resizing.flixster.com/-/400x600/v2/${current}` : null
}

type ScrapedMovie = {
  title: string | null
  year: number | null
  genres: string[]
  director: string[]
  cast: string[]
  runtime_minutes: number | null
  poster: string | null
  synopsis: string | null
  tomatometer: number | null
  audience_score: number | null
  critic_review_count: number | null
  audience_rating_count: number | null
  rt_url: string
  contentType: string | null // informational only ("Movie" | "TVSeries" | ...) -- not stored
}

function scrapeMovie(html: string, url: string): ScrapedMovie {
  const scorecard = findJsonScript(html, 'media-scorecard-json') ?? {}
  const hero = findJsonScript(html, 'media-hero-json') ?? {}
  const ld = findLdJson(html)

  const content = (hero.content as Record<string, unknown>) ?? {}
  const { year: yearStr, duration } = classifyMetadataProps(content.metadataProps)

  // metadataProps can carry "Now Playing" (in theaters) or "2022 - Present" (an ongoing TV
  // series) instead of a bare year, or omit it. ld+json's dateCreated is a real ISO date on
  // both movie and TV pages, so it's the authoritative fallback -- same as rt_scraper.py.
  let year = yearStr ? Number(yearStr) : null
  if (year === null) {
    const created = typeof ld.dateCreated === 'string' ? ld.dateCreated : ''
    const match = created.match(/^(\d{4})/)
    year = match ? Number(match[1]) : null
  }

  const scoreOf = (key: 'criticsScore' | 'audienceScore'): number | null => {
    const raw = (scorecard[key] as Record<string, unknown> | undefined)?.score
    return typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null
  }

  const audienceScoreBlock = (scorecard.audienceScore as Record<string, unknown>) ?? {}
  const bandedCount = parseBandedCount(audienceScoreBlock.bandedRatingCount)
  const audienceRatingCount =
    bandedCount !== null ? bandedCount : (audienceScoreBlock.reviewCount as number | undefined) ?? null

  const actors = Array.isArray(ld.actor)
    ? (ld.actor as Array<{ name?: string }>).map((a) => a.name).filter((n): n is string => Boolean(n)).slice(0, 8)
    : []
  const directors = Array.isArray(ld.director)
    ? (ld.director as Array<{ name?: string }>).map((d) => d.name).filter((n): n is string => Boolean(n))
    : []
  const genres = Array.isArray(content.metadataGenres)
    ? (content.metadataGenres as unknown[]).filter((g): g is string => typeof g === 'string')
    : Array.isArray(ld.genre)
      ? (ld.genre as unknown[]).filter((g): g is string => typeof g === 'string')
      : []

  return {
    title: (content.title as string) || (ld.name as string) || null,
    year,
    genres,
    director: directors,
    cast: actors,
    runtime_minutes: parseDurationToMinutes(duration),
    poster: sizedPosterImage((ld.image as string) || (content.posterSrc as string)),
    synopsis: typeof scorecard.description === 'string' ? scorecard.description : null,
    tomatometer: scoreOf('criticsScore'),
    audience_score: scoreOf('audienceScore'),
    critic_review_count:
      ((scorecard.criticsScore as Record<string, unknown>)?.reviewCount as number | undefined) ?? null,
    audience_rating_count: audienceRatingCount,
    rt_url: url,
    contentType: typeof ld['@type'] === 'string' ? (ld['@type'] as string) : null,
  }
}

/** Accepts a bare or scheme-less rottentomatoes.com URL and normalizes it -- an admin pasting
 * straight from the address bar or a share link shouldn't have to think about "https://". Rejects
 * anything else: this function fetches whatever host it's given server-side, so without this an
 * open POST-a-URL endpoint would let any caller make Supabase's edge network fetch arbitrary
 * internal or third-party addresses on its behalf (SSRF) -- a materially different risk than this
 * app's usual "no auth, anon can write anything" stance, which only ever touches this app's own
 * data, never makes the server reach out on a caller's behalf. */
function normalizeRtUrl(raw: string): URL | null {
  const withScheme = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()
  if (host !== 'rottentomatoes.com' && !host.endsWith('.rottentomatoes.com')) return null
  if (!/^\/(m|tv)\//.test(parsed.pathname)) return null // only movie/TV pages, not /celebrity/, /critics/, ...
  parsed.search = '' // strip tracking params (?ref=..., utm_*)
  parsed.hash = ''
  return parsed
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let rawUrl: unknown
  try {
    rawUrl = (await req.json())?.url
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return json({ error: 'Missing url.' }, 400)
  }

  const url = normalizeRtUrl(rawUrl)
  if (!url) {
    return json(
      { error: 'That doesn’t look like a Rotten Tomatoes movie or TV page (rottentomatoes.com/m/... or /tv/...).' },
      400
    )
  }

  let html: string
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    })
    if (res.status === 404) {
      return json({ error: "Rotten Tomatoes doesn't have a page at that link." }, 404)
    }
    if (!res.ok) {
      return json({ error: `Rotten Tomatoes returned ${res.status}.` }, 502)
    }
    html = await res.text()
  } catch (error) {
    return json({ error: `Couldn't reach Rotten Tomatoes: ${(error as Error).message}` }, 502)
  }

  const movie = scrapeMovie(html, url.toString())
  if (!movie.title) {
    // Neither the hero JSON nor ld+json parsed -- RT most likely changed its markup. Returning
    // whatever partial data exists would be worse than saying so plainly: a title-less "success"
    // would silently hand the admin form a wall of blank fields with no explanation.
    return json(
      { error: "Couldn't find movie data on that page -- Rotten Tomatoes may have changed its layout." },
      422
    )
  }

  return json({ movie })
})
