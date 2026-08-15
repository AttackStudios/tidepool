import { describe, expect, it } from 'vitest'
import { breakingGradient, depthAt, resample, validateProfile } from './breaks'
import type { BreakProfile, ProfilePoint } from './breaks'

const flat: ProfilePoint[] = [[0, 0], [100, 2], [200, 4]]

const mk = (over: Partial<BreakProfile> = {}): BreakProfile => ({
  id: 'x', name: 'X', hand: 'left', profile: flat,
  idealSwell: { directionDeg: 270, periodSec: 12, heightM: 2 }, ...over,
})

describe('depthAt', () => {
  it('interpolates between points', () => {
    expect(depthAt(flat, 50)).toBeCloseTo(1)
    expect(depthAt(flat, 150)).toBeCloseTo(3)
  })
  it('clamps outside the profile rather than extrapolating into nonsense', () => {
    expect(depthAt(flat, -10)).toBe(0)
    expect(depthAt(flat, 9999)).toBe(4)
  })
})

describe('resample', () => {
  it('produces evenly spaced samples spanning the profile', () => {
    const s = resample(flat, 5)
    expect(s).toHaveLength(5)
    expect(s[0]).toBe(0)
    expect(s[4]).toBe(4)
  })
  it('refuses a degenerate request', () => {
    expect(resample(flat, 1)).toEqual([])
  })
})

describe('breakingGradient', () => {
  it('ignores steepness that is out in deep water', () => {
    // Nazaré's canyon is the steepest thing in the dataset, but it drops away
    // offshore — its waves come from refraction, not from shoaling. Measuring
    // the whole profile would rank it as the hollowest wave in surfing.
    const canyon: ProfilePoint[] = [[0, 0], [50, 6], [120, 25], [220, 70], [350, 150]]
    const shelf: ProfilePoint[] = [[0, 0], [90, 3], [110, 3.2], [150, 9]]
    expect(breakingGradient(shelf, 3)).toBeGreaterThan(breakingGradient(canyon, 3))
  })

  it('rates an abrupt shelf above a long taper', () => {
    const point: ProfilePoint[] = [[0, 0], [240, 2.8], [550, 5]]
    const slab: ProfilePoint[] = [[0, 0], [70, 0.6], [100, 0.5], [130, 4]]
    expect(breakingGradient(slab, 2)).toBeGreaterThan(breakingGradient(point, 2))
  })

  it('scales the breaking zone with wave size', () => {
    // A bigger wave breaks further out, in deeper water, so it samples a
    // different part of the profile.
    const p: ProfilePoint[] = [[0, 0], [100, 2], [120, 2.2], [200, 12]]
    expect(breakingGradient(p, 8)).toBeGreaterThan(breakingGradient(p, 1))
  })
})

describe('validateProfile', () => {
  it('accepts a sane break', () => {
    expect(validateProfile(mk({ profile: [[0, 0], [100, 2], [200, 12]] }))).toEqual([])
  })
  it('catches points that go backwards', () => {
    const problems = validateProfile(mk({ profile: [[0, 0], [100, 2], [50, 12]] }))
    expect(problems.some((p) => /does not move offshore/.test(p.problem))).toBe(true)
  })
  it('catches negative depth', () => {
    expect(validateProfile(mk({ profile: [[0, 0], [100, -2], [200, 12]] })).length).toBeGreaterThan(0)
  })
  it('catches a profile that never reaches deep water', () => {
    const problems = validateProfile(mk({ profile: [[0, 0], [100, 1], [200, 2]] }))
    expect(problems.some((p) => /deep water/.test(p.problem))).toBe(true)
  })
})
