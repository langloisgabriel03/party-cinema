import { describe, expect, it } from 'vitest'

import { compareBy, parseSearchQuery, resolveSearchMatches } from './movieCatalog'

describe('parseSearchQuery', () => {
  const cases = [
    ['star wars 19', 'star wars', '19'],
    ['star wars 199', 'star wars', '199'],
    ['star wars 1977', 'star wars', '1977'],
    ['1917', '', '1917'],
    ['spider man 2', 'spider man 2', null],
    ["ocean's 11", "ocean's 11", null],
    ['apollo 13', 'apollo 13', null],
    ['district 9', 'district 9', null],
    ['catch 22', 'catch 22', null],
    ['2001 space odyssey', '2001 space odyssey', null], // leading digits are never a year
    ['top gun 86', 'top gun 86', null], // 2-digit shorthand years deliberately unsupported
    ['star wars 19   ', 'star wars', '19'], // trailing whitespace
    ['', '', null],
    ['   ', '', null],
  ]

  for (const [input, text, yearPrefix] of cases) {
    it(`"${input}" -> text="${text}" yearPrefix=${yearPrefix}`, () => {
      const result = parseSearchQuery(input)
      expect(result.text).toBe(text)
      expect(result.yearPrefix).toBe(yearPrefix)
    })
  }
})

describe('resolveSearchMatches', () => {
  // Minimal fake MiniSearch-shaped index: substring title match only, good enough to exercise
  // resolveSearchMatches's own branching without pulling in the real dependency.
  function fakeIndex(movies) {
    return {
      search(query) {
        const q = query.toLowerCase()
        return movies
          .filter((m) => m.title.toLowerCase().includes(q))
          .map((m, i) => ({ id: m.id, score: 100 - i }))
      },
    }
  }

  const movies = [
    { id: 1, title: 'Blade Runner 2049', year: 2017 },
    { id: 2, title: '1917', year: 2019 },
    { id: 3, title: 'Some 1917 Documentary', year: 1917 },
    { id: 4, title: 'Another Old Film', year: 1917 },
  ]

  it('falls back to plain text when the year interpretation yields nothing', () => {
    const result = resolveSearchMatches('blade runner 2049', movies, fakeIndex(movies))
    expect(result.ids.has(1)).toBe(true)
    expect(result.yearPrefix).toBe(null)
  })

  it('unions title matches with year matches for a year-only query', () => {
    const result = resolveSearchMatches('1917', movies, fakeIndex(movies))
    expect(result.ids.has(2)).toBe(true) // the film titled "1917"
    expect(result.ids.has(3)).toBe(true) // a film from 1917
    expect(result.ids.has(4)).toBe(true) // another film from 1917
  })

  it('every matched id has a rank entry -- no NaN sort', () => {
    const result = resolveSearchMatches('1917', movies, fakeIndex(movies))
    for (const id of result.ids) {
      expect(result.order.get(id)).not.toBeUndefined()
    }
  })

  it('returns null for an empty query, never an empty Set', () => {
    expect(resolveSearchMatches('', movies, fakeIndex(movies))).toBe(null)
    expect(resolveSearchMatches('   ', movies, fakeIndex(movies))).toBe(null)
  })
})

describe('compareBy', () => {
  it('sorts nulls last regardless of direction', () => {
    const items = [{ tomatometer: null }, { tomatometer: 50 }, { tomatometer: 90 }]
    expect([...items].sort(compareBy('Tomatometer', false)).map((i) => i.tomatometer)).toEqual([
      50, 90, null,
    ])
    expect([...items].sort(compareBy('Tomatometer', true)).map((i) => i.tomatometer)).toEqual([
      90, 50, null,
    ])
  })
})
