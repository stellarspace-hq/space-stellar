import { afterEach, describe, expect, it, vi } from 'vitest'
import { PFP_VARIANTS, getRandomPFP } from './gacha'

const stubRandom = (value: number) => vi.spyOn(Math, 'random').mockReturnValue(value)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PFP gacha weights', () => {
  it('sums to exactly 100 across all six variants', () => {
    expect(PFP_VARIANTS).toHaveLength(6)
    expect(PFP_VARIANTS.reduce((sum, variant) => sum + variant.weight, 0)).toBe(100)
  })
})

describe('getRandomPFP', () => {
  it.each([
    [0, 1],
    [0.05, 1],
    [0.399, 1],
    [0.401, 2],
    [0.649, 2],
    [0.651, 3],
    [0.799, 3],
    [0.801, 4],
    [0.899, 4],
    [0.901, 5],
    [0.969, 5],
    [0.971, 6],
    [0.999, 6],
  ])('maps Math.random()=%f to variant %i', (random, expectedId) => {
    stubRandom(random)
    expect(getRandomPFP().id).toBe(expectedId)
  })

  it('falls back to the first variant when the roll exceeds the total weight', () => {
    stubRandom(1.0001)
    expect(getRandomPFP().id).toBe(1)
  })

  it('returns a variant from the shared table', () => {
    stubRandom(0)
    expect(PFP_VARIANTS).toContain(getRandomPFP())
  })
})
