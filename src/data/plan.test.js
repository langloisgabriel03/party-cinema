import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nextDates } from './dates'
import {
  openPolls,
  pastNights,
  summarizePoll,
  unwatchedEntries,
  upcomingNights,
  watchedEntries,
} from './plan'

// "Watched" is entirely a question of where today's boundary falls, so every test here pins the
// clock. Fake timers only -- no timezone juggling: dates.js's own suite covers that, and these
// helpers go through todayISO() rather than parsing dates themselves.
const TODAY = '2026-09-09'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0)) // local noon on TODAY
})
afterEach(() => {
  vi.useRealTimers()
})

const night = (id, scheduledFor) => ({ id, scheduled_for: scheduledFor })

const catalog = (...ids) => new Map(ids.map((id) => [id, { id, title: `Movie ${id}` }]))

function build({ nights, attachments, movieIds, rsvps = [], profiles = [] }) {
  return watchedEntries({
    nights,
    nightMoviesByNight: new Map(Object.entries(attachments).map(([k, v]) => [k, v])),
    moviesById: catalog(...movieIds),
    rsvpsByNight: new Map(Object.entries(rsvps).map(([k, v]) => [k, v])),
    profiles,
  })
}

describe('pastNights', () => {
  it('excludes today -- tonight is still ahead of us', () => {
    const nights = [night('a', '2026-09-08'), night('b', TODAY), night('c', '2026-09-10')]
    expect(pastNights(nights).map((n) => n.id)).toEqual(['a'])
    // The two halves must partition the list exactly: no night in both, none in neither.
    expect(upcomingNights(nights).map((n) => n.id)).toEqual(['b', 'c'])
  })

  it('returns most recent first', () => {
    const nights = [night('old', '2026-01-01'), night('recent', '2026-09-01'), night('mid', '2026-05-01')]
    expect(pastNights(nights).map((n) => n.id)).toEqual(['recent', 'mid', 'old'])
  })
})

describe('watchedEntries', () => {
  it('lists films from past nights and ignores upcoming ones', () => {
    const watched = build({
      nights: [night('past', '2026-09-01'), night('future', '2026-09-20')],
      attachments: { past: [1], future: [2] },
      movieIds: [1, 2],
    })
    expect(watched.map((entry) => entry.movieId)).toEqual([1])
    expect(watched[0].watchedOn).toBe('2026-09-01')
    expect(watched[0].movie.title).toBe('Movie 1')
    expect(watched[0].times).toBe(1)
  })

  it('collapses a rewatch into one row dated by the most recent showing', () => {
    const watched = build({
      nights: [night('first', '2026-03-01'), night('again', '2026-08-01')],
      attachments: { first: [1], again: [1] },
      movieIds: [1],
    })
    expect(watched).toHaveLength(1)
    expect(watched[0].times).toBe(2)
    expect(watched[0].watchedOn).toBe('2026-08-01')
  })

  it('keeps a film that was never on the watchlist -- the "log what we already saw" flow', () => {
    const watched = build({
      nights: [night('logged', '2026-07-04')],
      attachments: { logged: [42] },
      movieIds: [42],
    })
    expect(watched.map((entry) => entry.movieId)).toEqual([42])
  })

  it('carries a null movie until the catalog backfills, rather than dropping the row', () => {
    const watched = build({
      nights: [night('past', '2026-09-01')],
      attachments: { past: [7] },
      movieIds: [], // ensureMovies() hasn't landed yet
    })
    expect(watched).toHaveLength(1)
    expect(watched[0].movie).toBeNull()
  })

  it('resolves watchedBy from going RSVPs only', () => {
    const profiles = [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Bo' },
      { id: 'p3', name: 'Cy' },
    ]
    const watched = build({
      nights: [night('past', '2026-09-01')],
      attachments: { past: [1] },
      movieIds: [1],
      rsvps: {
        past: [
          { night_id: 'past', profile_id: 'p1', going: true },
          { night_id: 'past', profile_id: 'p2', going: false },
          { night_id: 'past', profile_id: 'unknown', going: true }, // deleted profile
        ],
      },
      profiles,
    })
    expect(watched[0].watchedBy.map((p) => p.name)).toEqual(['Ana'])
  })

  it('survives a missing rsvp index (night_rsvps migration not run yet)', () => {
    const entries = watchedEntries({
      nights: [night('past', '2026-09-01')],
      nightMoviesByNight: new Map([['past', [1]]]),
      moviesById: catalog(1),
      rsvpsByNight: undefined,
      profiles: [],
    })
    expect(entries[0].watchedBy).toEqual([])
  })
})

describe('unwatchedEntries', () => {
  it('removes watchlist entries that already had their night', () => {
    const entries = [{ movieId: 1 }, { movieId: 2 }, { movieId: 3 }]
    const watched = [{ movieId: 2 }]
    expect(unwatchedEntries(entries, watched).map((e) => e.movieId)).toEqual([1, 3])
  })

  it('is a no-op with nothing watched', () => {
    const entries = [{ movieId: 1 }]
    expect(unwatchedEntries(entries, [])).toEqual(entries)
  })
})

describe('openPolls', () => {
  it('is newest question first and tolerates a movie the catalog has not backfilled', () => {
    const polls = openPolls(
      [
        { movie_id: 1, created_at: '2026-09-01T10:00:00Z', created_by: 'p1' },
        { movie_id: 2, created_at: '2026-09-05T10:00:00Z', created_by: 'p2' },
      ],
      catalog(1)
    )
    expect(polls.map((p) => p.movieId)).toEqual([2, 1])
    expect(polls[0].movie).toBeNull()
    expect(polls[1].movie.title).toBe('Movie 1')
  })
})

describe('summarizePoll', () => {
  const profiles = [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Bo' },
    { id: 'p3', name: 'Cy' },
  ]
  const dates = ['2026-09-09', '2026-09-10', '2026-09-11']
  const row = (profile, date) => ({ movie_id: 1, profile_id: profile, available_on: date })

  it('tallies per day, crowns the busiest and tracks my own picks', () => {
    const result = summarizePoll({
      rows: [
        row('p1', '2026-09-10'),
        row('p2', '2026-09-10'),
        row('p3', '2026-09-11'),
        row('p1', '2026-09-11'),
      ],
      dates,
      profiles,
      profileId: 'p1',
    })
    expect(result.byDate.get('2026-09-09')).toEqual([])
    expect(result.topCount).toBe(2)
    // Two days tie on 2 -- both are offered, no arbitrary winner.
    expect(result.best).toEqual(['2026-09-10', '2026-09-11'])
    expect([...result.mine]).toEqual(['2026-09-10', '2026-09-11'])
    expect(result.responders.map((p) => p.name).sort()).toEqual(['Ana', 'Bo', 'Cy'])
  })

  it('has no best day until somebody answers', () => {
    const result = summarizePoll({ rows: [], dates, profiles, profileId: 'p1' })
    expect(result.best).toEqual([])
    expect(result.topCount).toBe(0)
    expect(result.responders).toEqual([])
    // Every offered day still has an entry, so the grid renders the same shape either way.
    expect([...result.byDate.keys()]).toEqual(dates)
  })

  it('ignores an answer for a day that is no longer offered', () => {
    const result = summarizePoll({
      rows: [row('p1', '2026-08-01'), row('p2', '2026-09-10')],
      dates,
      profiles,
      profileId: 'p1',
    })
    expect(result.topCount).toBe(1)
    expect(result.mine.size).toBe(0)
    expect(result.responders.map((p) => p.name)).toEqual(['Bo'])
  })
})

describe('nextDates', () => {
  it('starts today and runs consecutively', () => {
    expect(nextDates(3)).toEqual(['2026-09-09', '2026-09-10', '2026-09-11'])
  })

  it('rolls over a month end', () => {
    expect(nextDates(3, new Date(2026, 8, 29))).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })

  it('rolls over a year end', () => {
    expect(nextDates(2, new Date(2026, 11, 31))).toEqual(['2026-12-31', '2027-01-01'])
  })
})
