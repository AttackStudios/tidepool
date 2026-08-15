/**
 * Break-profile maths.
 *
 * A break is described as a cross-section of the sea floor: depth against
 * distance from shore. In a 2.5D surf sim that cross-section is very nearly the
 * whole story, because what a wave does is decided by how fast the bottom rises
 * underneath it.
 */

/** [distance from shore in metres, depth in metres] */
export type ProfilePoint = [number, number]

export interface BreakProfile {
  id: string
  name: string
  hand: 'left' | 'right' | 'both'
  profile: ProfilePoint[]
  idealSwell: { directionDeg: number; periodSec: number; heightM: number }
}

export interface ProfileProblem {
  id: string
  problem: string
}

/**
 * Depth interpolated at an arbitrary distance from shore.
 *
 * The game's contour editor will want evenly spaced samples, not the sparse
 * hand-authored points, so everything downstream goes through this.
 */
export function depthAt(profile: ProfilePoint[], distance: number): number {
  if (profile.length === 0) return 0
  const first = profile[0]!
  const last = profile[profile.length - 1]!
  if (distance <= first[0]) return first[1]
  if (distance >= last[0]) return last[1]

  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, d0] = profile[i]!
    const [x1, d1] = profile[i + 1]!
    if (distance >= x0 && distance <= x1) {
      const t = x1 === x0 ? 0 : (distance - x0) / (x1 - x0)
      return d0 + (d1 - d0) * t
    }
  }
  return last[1]
}

/** Evenly spaced depth samples, ready to hand to a contour editor. */
export function resample(profile: ProfilePoint[], count: number): number[] {
  if (count < 2 || profile.length === 0) return []
  const end = profile[profile.length - 1]![0]
  return Array.from({ length: count }, (_, i) => depthAt(profile, (end * i) / (count - 1)))
}

/**
 * How abruptly the bottom rises where the wave actually breaks.
 *
 * Waves break in shallow water — roughly where depth falls below about 1.3x the
 * wave height — so measuring the gradient across the whole profile is
 * misleading. Nazaré has the steepest raw gradient of any break here, but that
 * is its canyon dropping away offshore; its waves come from refraction, not
 * shoaling. Restricting to the breaking zone is what actually predicts how
 * hollow a wave will be.
 */
export function breakingGradient(profile: ProfilePoint[], waveHeightM: number): number {
  const breakDepth = waveHeightM * 1.3
  let steepest = 0
  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, d0] = profile[i]!
    const [x1, d1] = profile[i + 1]!
    // Only segments that sit within, or cross into, the breaking zone.
    if (Math.min(d0, d1) > breakDepth) continue
    const run = x1 - x0
    if (run <= 0) continue
    steepest = Math.max(steepest, Math.abs(d1 - d0) / run)
  }
  return steepest
}

/** Sanity checks a hand-authored profile, so a typo is caught before it ships. */
export function validateProfile(b: BreakProfile): ProfileProblem[] {
  const problems: ProfileProblem[] = []
  const add = (problem: string) => problems.push({ id: b.id, problem })

  if (b.profile.length < 3) add('needs at least three points to describe a gradient')

  for (let i = 0; i < b.profile.length; i++) {
    const [x, d] = b.profile[i]!
    if (!Number.isFinite(x) || !Number.isFinite(d)) add(`point ${i} is not a number`)
    if (d < 0) add(`point ${i} has negative depth`)
    if (i > 0 && x <= b.profile[i - 1]![0]) add(`point ${i} does not move offshore`)
  }

  const last = b.profile[b.profile.length - 1]
  if (last && last[1] < 3) add('never reaches deep water, so swell has nowhere to arrive from')
  if (b.idealSwell.periodSec < 4) add('swell period is implausibly short')

  return problems
}
