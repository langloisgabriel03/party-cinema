import { describe, expect, it } from 'vitest'

import { fromISODate, todayISO, toISODate } from './dates'

// The bug this guards against is invisible in your own timezone -- new Date('2026-08-25')
// parses as UTC midnight, which renders as the wrong day in any negative-offset zone. Testing
// across timezones (not just the ambient one) is the whole point of this file.
describe('date round-trip across timezones', () => {
  const zones = ['Pacific/Kiritimati', 'Pacific/Midway', 'America/Montreal', 'UTC']
  const originalTz = process.env.TZ

  for (const tz of zones) {
    it(`fromISODate/toISODate round-trip in ${tz}`, () => {
      process.env.TZ = tz
      try {
        const iso = '2026-08-25'
        expect(fromISODate(iso).getDate()).toBe(25)
        expect(toISODate(fromISODate(iso))).toBe(iso)
      } finally {
        process.env.TZ = originalTz
      }
    })
  }
})

describe('todayISO', () => {
  it('returns a plausible ISO date string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
