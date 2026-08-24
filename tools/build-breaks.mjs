/**
 * Validate the break dataset and rank it by how hollow each wave should be.
 *
 * The conversion to Surf Sandbox's own beach format is deliberately not written
 * yet — the schema is unknown until the game ships. Everything up to that point
 * is done here, so day one is a mapping exercise rather than research.
 *
 *   node tools/build-breaks.mjs
 */
import { readFileSync } from 'node:fs'
import { breakingGradient, resample, validateProfile } from '../dist/shared/breaks.js'
import { GRID, SCHEMA_KNOWN, beachFileName, toBeachFile } from './beach-format.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../essentials/breaks/breaks.json', import.meta.url)))

let problems = 0
for (const b of data.breaks) {
  for (const p of validateProfile(b)) {
    console.error(`  INVALID ${p.id}: ${p.problem}`)
    problems++
  }
}
if (problems > 0) {
  console.error(`\n${problems} problem(s) in the dataset.`)
  process.exit(1)
}

const ranked = data.breaks
  .map((b) => ({
    name: b.name,
    hand: b.hand,
    gradient: breakingGradient(b.profile, b.idealSwell.heightM),
    height: b.idealSwell.heightM,
    tags: b.tags.join(', '),
  }))
  .sort((a, b) => b.gradient - a.gradient)

console.log(`${data.breaks.length} breaks, all valid.\n`)
console.log('Ranked by breaking-zone gradient (how hollow the wave should be):\n')
for (const r of ranked) {
  const bar = '#'.repeat(Math.max(1, Math.round(r.gradient * 40)))
  console.log(`  ${r.name.padEnd(20)} ${r.gradient.toFixed(3).padStart(6)}  ${bar}`)
}

console.log('\nSample resample (Pipeline, 12 points, metres depth):')
const pipeline = data.breaks.find((b) => b.id === 'pipeline')
console.log('  ' + resample(pipeline.profile, 12).map((d) => d.toFixed(1)).join('  '))

// ---- build the pack -------------------------------------------------------
//
// Everything above is research and does not change. This is the part that waits
// on the game: one function in tools/beach-format.mjs.

const outDir = new URL('../essentials/breaks/pack/', import.meta.url)
const zipPath = new URL('../essentials/breaks/break-pack.zip', import.meta.url)

if (!SCHEMA_KNOWN) {
  console.log('\nPack not built: the beach schema is not known yet.')
  console.log('Make a beach in-game, read its JSON, fill in FIELDS and GRID in')
  console.log('tools/beach-format.mjs, set SCHEMA_KNOWN = true, and run this again.')
  process.exit(0)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

let written = 0
for (const b of data.breaks) {
  // Our profiles are deliberately irregular — dense inshore where the shape
  // decides the wave, sparse offshore where it does not. If the game wants an
  // even grid, resample onto one rather than shipping our spacing.
  const grid = GRID.sampleCount ? resample(b.profile, GRID.sampleCount) : null
  const file = toBeachFile(b, grid)
  writeFileSync(new URL(beachFileName(b), outDir), JSON.stringify(file, null, 2) + '\n')
  written++
}

// Zipped because that is what Essentials serves and what the installer expects.
execFileSync('zip', ['-qrj', zipPath.pathname, outDir.pathname])
console.log(`\nPack built: ${written} beaches -> ${zipPath.pathname}`)
console.log('Next: upload it, then set downloadUrl and status "released" on the')
console.log('Break Pack entry in essentials/index.json. No app release needed.')
