// Pure data helpers for the movie catalog -- no React here, mirrors data/avatars.js's role.

const SORT_FIELDS = {
  Title: 'title',
  Year: 'year',
  Tomatometer: 'tomatometer',
  Popcornmeter: 'audience_score',
  'Weighted Score': 'weightedScore',
  Runtime: 'runtime_minutes',
}

export const SORT_OPTIONS = Object.keys(SORT_FIELDS)

// Niche/awards-circuit genres for a "movie night with friends" app -- hidden behind a "Show
// more" toggle in the filter dialog by default rather than cluttering the primary chip row.
export const SECONDARY_GENRES = new Set([
  'Sport',
  'War',
  'Western',
  'Romance',
  'Musical',
  'Music',
  'History',
  'Drama',
  'Documentary',
  'Biography',
])

// Same idea for the smaller/niche studio lists.
export const SECONDARY_LISTS = new Set(['screen_gems', 'dark_castle', 'neon', 'platinum_dunes'])

// Hard floor, not a user-togglable filter: excludes niche/random titles nobody's heard of.
// Unlike a score floor, a missing/zero rating count IS exactly the "obscure" signal this is
// meant to catch, so null counts as 0 here (unrated == nobody's watched it == excluded).
export const MIN_AUDIENCE_RATING_COUNT = 50

/**
 * Mirrors rt-dashboard's actual Library-page formula: a plain mean, not the unrelated 2/3-1/3
 * formula used elsewhere in that project for a different (live single-search) page.
 */
export function weightedScore({ tomatometer, audience_score }) {
  if (tomatometer == null && audience_score == null) return null
  if (tomatometer == null) return audience_score
  if (audience_score == null) return tomatometer
  return Math.round((tomatometer + audience_score) / 2)
}

/** Nulls always sort last, regardless of direction -- avoids NaN from naive numeric subtraction. */
export function compareBy(sortBy, desc) {
  const field = SORT_FIELDS[sortBy] ?? 'title'
  return (a, b) => {
    const av = field === 'weightedScore' ? a.weightedScore : a[field]
    const bv = field === 'weightedScore' ? b.weightedScore : b[field]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'string') return desc ? bv.localeCompare(av) : av.localeCompare(bv)
    return desc ? bv - av : av - bv
  }
}

function bounds(movies, field) {
  let min = null
  let max = null
  for (const movie of movies) {
    const value = movie[field]
    if (value == null) continue
    if (min == null || value < min) min = value
    if (max == null || value > max) max = value
  }
  return { min, max }
}

/** Actual data bounds -- used as always-active year filter defaults, slider ranges, and labels. */
export function deriveFilterBounds(movies) {
  const year = bounds(movies, 'year')
  const runtime = bounds(movies, 'runtime_minutes')
  const tomatometer = bounds(movies, 'tomatometer')
  const audienceScore = bounds(movies, 'audience_score')
  const criticReviewCount = bounds(movies, 'critic_review_count')
  const audienceRatingCount = bounds(movies, 'audience_rating_count')
  return {
    yearMin: year.min ?? 1900,
    yearMax: year.max ?? new Date().getFullYear(),
    runtimeBounds: runtime,
    tomatometerBounds: tomatometer,
    audienceScoreBounds: audienceScore,
    // Sliders need a real 0-based floor even though no movie has exactly 0 reviews -- "no
    // minimum" has to be reachable by dragging all the way down.
    criticReviewCountBounds: { min: 0, max: criticReviewCount.max ?? 0 },
    audienceRatingCountBounds: { min: 0, max: audienceRatingCount.max ?? 0 },
  }
}

/** Only offer genres that at least one loaded movie actually has -- mirrors rt-dashboard's present_genres. */
export function getPresentGenres(movies, canonicalGenres) {
  const present = new Set()
  for (const movie of movies) {
    for (const genre of movie.genres) present.add(genre)
  }
  return canonicalGenres.filter((genre) => present.has(genre))
}

export function getDistinctFranchises(movies) {
  const set = new Set()
  for (const movie of movies) {
    if (movie.franchise) set.add(movie.franchise)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function createDefaultFilters(bounds) {
  return {
    lists: [],
    genres: [],
    onlyFranchise: false,
    franchises: [],
    yearMin: bounds.yearMin,
    yearMax: bounds.yearMax,
    runtimeMin: null,
    runtimeMax: null,
    tomatometerMin: null,
    tomatometerMax: null,
    audienceScoreMin: null,
    audienceScoreMax: null,
    minCriticReviews: 0,
    minAudienceRatings: 0,
    sortBy: 'Title',
    sortDesc: false,
  }
}

/**
 * Active filters as removable chips: `clear` is a plain patch to merge into filter state, not a
 * closure, so this stays a pure function -- also doubles as the "Filters" button's badge count.
 */
export function describeActiveFilters(filters, bounds) {
  const chips = []
  if (filters.lists.length) chips.push({ key: 'lists', label: `List (${filters.lists.length})`, clear: { lists: [] } })
  if (filters.genres.length) chips.push({ key: 'genres', label: `Genre (${filters.genres.length})`, clear: { genres: [] } })
  if (filters.onlyFranchise || filters.franchises.length)
    chips.push({ key: 'franchise', label: 'Franchise', clear: { onlyFranchise: false, franchises: [] } })
  if (filters.yearMin !== bounds.yearMin || filters.yearMax !== bounds.yearMax)
    chips.push({
      key: 'year',
      label: `Year ${filters.yearMin}–${filters.yearMax}`,
      clear: { yearMin: bounds.yearMin, yearMax: bounds.yearMax },
    })
  if (filters.runtimeMin != null || filters.runtimeMax != null)
    chips.push({ key: 'runtime', label: 'Runtime', clear: { runtimeMin: null, runtimeMax: null } })
  if (filters.tomatometerMin != null || filters.tomatometerMax != null)
    chips.push({ key: 'tomatometer', label: 'Tomatometer', clear: { tomatometerMin: null, tomatometerMax: null } })
  if (filters.audienceScoreMin != null || filters.audienceScoreMax != null)
    chips.push({ key: 'audience', label: 'Popcornmeter', clear: { audienceScoreMin: null, audienceScoreMax: null } })
  if (filters.minCriticReviews > 0)
    chips.push({
      key: 'criticMin',
      label: `Critic reviews ≥${filters.minCriticReviews}`,
      clear: { minCriticReviews: 0 },
    })
  if (filters.minAudienceRatings > 0)
    chips.push({
      key: 'audienceMin',
      label: `Audience ratings ≥${filters.minAudienceRatings}`,
      clear: { minAudienceRatings: 0 },
    })
  return chips
}

export function filterMovies(movies, filters, matchIds) {
  return movies.filter((movie) => {
    if (matchIds && !matchIds.has(movie.id)) return false
    if ((movie.audience_rating_count ?? 0) < MIN_AUDIENCE_RATING_COUNT) return false
    if (filters.lists.length && !movie.lists.some((l) => filters.lists.includes(l))) return false
    if (filters.genres.length && !movie.genres.some((g) => filters.genres.includes(g))) return false
    if (filters.onlyFranchise && !movie.franchise) return false
    if (filters.franchises.length && !filters.franchises.includes(movie.franchise)) return false
    if (movie.year < filters.yearMin || movie.year > filters.yearMax) return false
    if (filters.runtimeMin != null && (movie.runtime_minutes ?? -Infinity) < filters.runtimeMin) return false
    if (filters.runtimeMax != null && (movie.runtime_minutes ?? Infinity) > filters.runtimeMax) return false
    if (filters.tomatometerMin != null && (movie.tomatometer ?? -Infinity) < filters.tomatometerMin) return false
    if (filters.tomatometerMax != null && (movie.tomatometer ?? Infinity) > filters.tomatometerMax) return false
    if (
      filters.audienceScoreMin != null &&
      (movie.audience_score ?? -Infinity) < filters.audienceScoreMin
    )
      return false
    if (
      filters.audienceScoreMax != null &&
      (movie.audience_score ?? Infinity) > filters.audienceScoreMax
    )
      return false
    if (filters.minCriticReviews > 0 && (movie.critic_review_count ?? 0) < filters.minCriticReviews)
      return false
    if (
      filters.minAudienceRatings > 0 &&
      (movie.audience_rating_count ?? 0) < filters.minAudienceRatings
    )
      return false
    return true
  })
}

const YEAR_TOKEN = /^\d{2,4}$/

/**
 * A trailing all-digit token is a year *prefix* only if it's 2-4 digits and starts with 19 or 20
 * -- so "star wars 19" means the 1900s, "199" the 1990s, "1977" exactly 1977. The 19/20 guard is
 * what keeps "apollo 13", "catch 22", "district 9" and "ocean's 11" ordinary text searches.
 * Leading digits are never treated as years: "1917", "2012" and "300" are titles far more often
 * than filters.
 */
export function parseSearchQuery(raw) {
  const full = raw.trim()
  if (!full) return { text: '', yearPrefix: null, full: '' }
  const tokens = full.split(/\s+/)
  const last = tokens[tokens.length - 1]
  if (!YEAR_TOKEN.test(last) || !(last.startsWith('19') || last.startsWith('20')))
    return { text: full, yearPrefix: null, full }
  return { text: tokens.slice(0, -1).join(' '), yearPrefix: last, full }
}

/** Every id in `ids` gets an `order` entry -- a partial map would NaN out the caller's comparator. */
function ranked(hits, extraIds) {
  const ids = new Set(hits.map((h) => h.id))
  const order = new Map(hits.map((h, i) => [h.id, i]))
  if (extraIds) {
    for (const id of extraIds) {
      if (!ids.has(id)) {
        ids.add(id)
        order.set(id, hits.length) // one shared rank; the caller's sort breaks the tie
      }
    }
  }
  return { ids, order }
}

/**
 * Returns null when there's no query at all -- filterMovies reads that as "no search".
 * `index` is passed in (not imported) so this file stays pure/no-React, matching its header.
 */
export function resolveSearchMatches(rawQuery, movies, index) {
  const { text, yearPrefix, full } = parseSearchQuery(rawQuery)
  if (!full) return null
  const search = (q) => (index ? index.search(q) : [])
  if (!yearPrefix) return { ...ranked(search(full)), yearPrefix: null }

  const yearIds = new Set()
  for (const movie of movies) if (String(movie.year).startsWith(yearPrefix)) yearIds.add(movie.id)

  // Query is only the year: union, so "1917" surfaces the film 1917 *and* films from 1917.
  if (!text) return { ...ranked(search(full), yearIds), yearPrefix }

  const hits = search(text).filter((hit) => yearIds.has(hit.id))
  if (hits.length) return { ...ranked(hits), yearPrefix }

  // Nothing from that year: the digits were probably part of the title ("blade runner 2049", a
  // 2017 film). Decided here, on the raw match set -- deliberately *before* filterMovies runs,
  // so toggling a genre chip can never flip which reading of the query is in effect.
  return { ...ranked(search(full)), yearPrefix: null }
}
