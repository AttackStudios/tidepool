/**
 * Turning a break profile into a Surf Sandbox beach file.
 *
 * THIS IS THE ONLY FILE THAT NEEDS EDITING once the game exists. Everything
 * else — the nine profiles, validation, ranking, packaging, install routing —
 * is done and tested. Fill in `toBeachFile` and the pack builds.
 *
 * ## What we know before release
 *
 * Steam's feature list: "Adjust bottom contours, wave height, period, and
 * frequency" and "Design: name your spot, restore the reef, and make your break
 * unique". nocanwin's 11 April post: "I finally put the sand in sandbox. The
 * ocean floor can be changed now."
 *
 * So a beach is at minimum: a name, and a description of the sea floor.
 * `beaches.ts` already established they are JSON files in the Unity save
 * folder, found by content rather than a hardcoded path.
 *
 * ## What to do on release day
 *
 * 1. Make a beach in-game and name it something findable, e.g. "zzTest".
 * 2. `readBeaches(findBeachDir(...))` — or just read the JSON off disk.
 * 3. Fill in FIELDS below to match what you see, and flip SCHEMA_KNOWN to true.
 * 4. `npm run breaks` writes the pack and prints what it produced.
 *
 * Resist normalising their schema into something nicer. Write exactly what the
 * game writes; a beach the game refuses to load is worth less than an ugly one.
 */

/** Flip to true once FIELDS below matches a real save file. */
export const SCHEMA_KNOWN = false

/**
 * Field names in the game's own beach JSON.
 *
 * Left as a single object so that mapping the schema is one edit in one place
 * rather than a hunt through string literals.
 */
export const FIELDS = {
  name: 'name',
  /** The depth-vs-distance samples, whatever the game calls them. */
  profile: 'bottomContour',
  /** If depths are stored as a bare array, the key holding it. */
  depths: 'depths',
  /** Spacing between samples, if the game stores samples rather than pairs. */
  spacing: 'spacing',
  waveHeight: 'waveHeight',
  wavePeriod: 'wavePeriod',
  swellDirection: 'swellDirection',
}

/**
 * How many samples the game expects, and how far apart.
 *
 * Our profiles are irregularly spaced (dense near shore, sparse offshore,
 * because that is where the shape matters). `resample` in shared/breaks.ts
 * converts to an even grid — it exists for exactly this.
 */
export const GRID = {
  /** Set from the real file. Null means "keep our own points". */
  sampleCount: null,
  /** Metres between samples, if fixed. */
  spacingM: null,
}

/**
 * Convert one break into the object the game will write to disk.
 *
 * @param {{id:string,name:string,location:string,idealSwell:object,profile:[number,number][]}} brk
 * @param {number[]} resampled  Evenly spaced depths, when GRID.sampleCount is set.
 * @returns {object} plain JSON, serialised verbatim
 */
export function toBeachFile(brk, resampled) {
  if (!SCHEMA_KNOWN) {
    throw new Error(
      'Beach schema is not known yet. Make a beach in-game, read its JSON, fill in ' +
        'FIELDS and GRID in tools/beach-format.mjs, then set SCHEMA_KNOWN = true.',
    )
  }

  // ---- fill in from a real save file -------------------------------------
  return {
    [FIELDS.name]: brk.name,
    [FIELDS.profile]: resampled ?? brk.profile,
    [FIELDS.waveHeight]: brk.idealSwell.heightM,
    [FIELDS.wavePeriod]: brk.idealSwell.periodSec,
    [FIELDS.swellDirection]: brk.idealSwell.directionDeg,
  }
  // ------------------------------------------------------------------------
}

/** File name for a break, matching whatever convention the game uses. */
export function beachFileName(brk) {
  return `${brk.id}.json`
}
