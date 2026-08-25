/**
 * Turning a break profile into a Surf Sandbox level file.
 *
 * Schema read directly from the game's own presets in
 * `SurfSandbox_Data/StreamingAssets/Levels/*.lvl`, which are plain JSON:
 *
 *   { "GroundHeights": [321 floats], "Swell": float, "Tide": float }
 *
 * - **321 samples, index 0 is the shore**, running straight out to sea.
 *   Pipeline.lvl lines up with a real Pipeline cross-section at one sample per
 *   metre, so the array spans 0–320 m.
 * - **Heights, not depths.** Depth below the waterline is `Tide - height`, so a
 *   value above `Tide` is dry beach.
 * - **Quantised to 1/32.** Every value in every preset is a multiple of
 *   0.03125; writing anything finer is writing noise.
 * - **Depth clamps at 1.0 unit.** Pipeline.lvl flatlines from index 240 out,
 *   which is the game's floor rather than the real sea floor.
 */

export const SCHEMA_KNOWN = true

/** Samples per level file, one per metre from the shoreline. */
export const SAMPLES = 321

/** Values are multiples of 1/32 in every shipped preset. */
export const QUANTUM = 1 / 32

/** The waterline. Every preset ships 1.0. */
export const TIDE = 1.0

/**
 * Metres per depth unit.
 *
 * Least-squares fit of the game's own Pipeline.lvl against a real Pipeline
 * cross-section over the 229 unclamped samples: 14.8 m, rms 2.26 m. Rounded to
 * 15, because a fit that precise on 36 quantisation levels is false precision.
 *
 * This is the number that keeps breaks comparable to each other. Normalising
 * each break to its own maximum instead would flatten exactly the differences
 * the pack exists to show.
 */
export const METRES_PER_UNIT = 15

/**
 * How much of the game's depth range a break's deepest point should reach.
 *
 * A single metres-per-unit scale across every break is physically honest and
 * unplayable. Pleasure Point only reaches 2.8 m in its first 320 m — that is
 * genuinely what the seabed does there — and at 15 m per unit it came out
 * knee-deep, so the game stands you up instead of letting you surf.
 *
 * So each break is scaled to its own depth instead. The shape is what carries a
 * break's character — where it shoals, how abruptly — and shape survives
 * scaling. Absolute depth does not survive being unsurfable.
 *
 * Just under 1.0 because the game clamps there, and a profile that flatlines at
 * the floor loses the outer part of its shape.
 */
const DEPTH_TARGET = 0.9

/**
 * Dry beach in front of the waterline.
 *
 * Our profiles start at the shoreline; the game's presets all begin above the
 * tide. Without a little land the level starts at a wall of water. Matches the
 * presets' modest rise rather than inventing terrain.
 */
const BEACH_M = 8
const BEACH_RISE = 3 * QUANTUM

const quantise = (v) => Math.round(v / QUANTUM) * QUANTUM

/** Depth in metres at a distance, linearly interpolated, flat past the end. */
function depthAt(profile, x) {
  if (x <= profile[0][0]) return profile[0][1]
  for (let i = 1; i < profile.length; i++) {
    const [x0, d0] = profile[i - 1]
    const [x1, d1] = profile[i]
    if (x <= x1) return d0 + ((x - x0) / (x1 - x0)) * (d1 - d0)
  }
  return profile[profile.length - 1][1]
}

export function toBeachFile(brk) {
  // Scaled to the deepest point the level actually reaches — measured across the
  // window the game samples, not the whole profile.
  //
  // The profiles run out to a couple of kilometres, but a level is 321 samples
  // at one metre each. Scaling against water 2 km offshore made Pleasure Point
  // 0.13 units deep: its first 320 m only reach 2.8 m, which is what makes it a
  // gentle point break, and what made it unsurfable in game.
  let deepest = 0.1
  for (let i = BEACH_M; i < SAMPLES; i++) {
    const d = depthAt(brk.profile, i - BEACH_M)
    if (d > deepest) deepest = d
  }
  const perUnit = deepest / DEPTH_TARGET

  const heights = []
  for (let i = 0; i < SAMPLES; i++) {
    let h
    if (i < BEACH_M) {
      // Ramp down across the beach to meet the waterline.
      h = TIDE + BEACH_RISE * (1 - i / BEACH_M)
    } else {
      const metres = i - BEACH_M
      const units = Math.min(depthAt(brk.profile, metres) / perUnit, 1)
      h = TIDE - units
    }
    heights.push(quantise(Math.max(h, 0)))
  }

  return {
    GroundHeights: heights,
    // Presets run 0.8 (Pipeline) to 1.0 (Sunset), so this is a slider rather
    // than a height in depth units. Calibrated so Pipeline's 3 m lands on the
    // 0.8 nocanwin gave it.
    Swell: quantise(Math.min(Math.max(brk.idealSwell.heightM / 3.75, 0.25), 1)),
    Tide: TIDE,
  }
}

/**
 * Levels the game ships, as of 25 Aug 2026.
 *
 * The file name is the name shown in game, and writing into
 * StreamingAssets/Levels means a matching name silently replaces a preset —
 * which is how I destroyed nocanwin's own Pipeline.lvl before restoring it from
 * a copy. A pack must never be able to eat the base game's content.
 */
export const SHIPPED_LEVELS = new Set([
  'Bellows', 'Kawaikui', 'KeIki', 'Kewalo', 'Kokololio', 'Makaha', 'Makapuu',
  'Mokuleia', 'Pipeline', 'Portlock', 'Sandys', 'Sunset', 'Tracks', 'Waikiki',
  'WhitePlains', 'Yokahama',
])

/** Levels are named by their file, so this is the name shown in game. */
export function beachFileName(brk) {
  // Decompose first so accents become separate marks and can be dropped —
  // otherwise "Nazaré" loses the é entirely and ships as "Nazar".
  // Accents are decomposed and dropped for cross-platform safety, but spaces
  // and apostrophes are kept: this string is the name on the level list, and
  // "JeffreysBay" is not what the place is called.
  const ascii = brk.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const base = ascii.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').trim()
  // Only disambiguate on an actual clash, so eight of the nine keep their real
  // names and the ninth is obviously ours rather than a replacement.
  // Prefixed so the pack groups together in the game's level list instead of
  // scattering through sixteen presets with nothing to say which is which.
  // "[" sorts ahead of letters, so the set lands together at the top.
  return `[BP] ${base}.lvl`
}
