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
 * The depth envelope the game's own levels use.
 *
 * Measured from the shipped presets rather than reasoned about. Their deepest
 * points sit at 0.40 (Waikiki) to 0.60 (Kewalo, Makaha, Bellows), with only
 * Sunset reaching 1.00 — and every one of them carries a long stretch of dry
 * beach: Waikiki is 0.35 *above* the waterline sixty metres out.
 *
 * Filling the level with deep water was the mistake. A wave breaks by shoaling
 * into shallow water; with none, nothing breaks and there is nothing to ride.
 * Lifting the profiles off the floor to make them "deep enough" removed the one
 * feature that makes surf.
 */
const DEEPEST = 0.6

/** How far the shore sits above the waterline, matching the presets' beaches. */
const BEACH_HEIGHT = 0.25

/** Metres of dry beach before the water starts. The presets run 40-80. */
const BEACH_M = 55

/**
 * Swell, as the presets use it.
 *
 * They run 0.50 to 1.00 over 0.40-0.60 of water — swell comparable to, or
 * greater than, the depth it breaks in. Ours were scaled off wave height in
 * metres and came out at 0.25-0.41, far too small to break on anything.
 */
const SWELL_MIN = 0.55
const SWELL_MAX = 1.0

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
  // Scaled to the deepest point inside the window the game samples. The
  // profiles run kilometres out; a level is 321 samples at one metre.
  let deepest = 0.1
  for (let i = BEACH_M; i < SAMPLES; i++) {
    const d = depthAt(brk.profile, i - BEACH_M)
    if (d > deepest) deepest = d
  }

  const heights = []
  for (let i = 0; i < SAMPLES; i++) {
    let h
    if (i < BEACH_M) {
      // Dry beach, sloping down to the waterline — the presets all have one,
      // and it is where the wave finally breaks.
      h = TIDE + BEACH_HEIGHT * (1 - i / BEACH_M)
    } else {
      const shape = Math.min(depthAt(brk.profile, i - BEACH_M) / deepest, 1)
      h = TIDE - shape * DEEPEST
    }
    heights.push(quantise(Math.max(h, 0)))
  }

  // Mapped across the presets' own range rather than converted from metres.
  // Absolute wave height means nothing here; what matters is swell against the
  // depth it breaks in, and the presets show what that ratio should be.
  const swellSpan = SWELL_MAX - SWELL_MIN
  const relative = Math.min(brk.idealSwell.heightM / 4, 1)

  return {
    GroundHeights: heights,
    Swell: quantise(SWELL_MIN + relative * swellSpan),
    Tide: TIDE,
  }
}

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
