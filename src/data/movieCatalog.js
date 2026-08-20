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

/** Actual data bounds -- used as always-active year filter defaults and as label/placeholder text. */
export function deriveFilterBounds(movies) {
  const year = bounds(movies, 'year')
  const runtime = bounds(movies, 'runtime_minutes')
  const tomatometer = bounds(movies, 'tomatometer')
  const audienceScore = bounds(movies, 'audience_score')
  return {
    yearMin: year.min ?? 1900,
    yearMax: year.max ?? new Date().getFullYear(),
    runtimeBounds: runtime,
    tomatometerBounds: tomatometer,
    audienceScoreBounds: audienceScore,
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
