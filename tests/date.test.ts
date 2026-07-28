import { afterAll, describe, expect, it } from 'vitest'

import { toLocalDateString } from '../src/utils/date'

const originalTimezone = process.env.TZ

afterAll(() => {
  process.env.TZ = originalTimezone
})

describe('toLocalDateString', () => {
  it('uses the local calendar date instead of UTC', () => {
    process.env.TZ = 'Asia/Tokyo'
    const shortlyAfterMidnight = new Date('2026-07-27T15:30:00.000Z')

    expect(toLocalDateString(shortlyAfterMidnight)).toBe('2026-07-28')
  })
})
