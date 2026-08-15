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

console.log('\nNot yet written: the mapping onto the game\'s beach JSON.')
console.log('Add it here once the schema is known — the research above does not change.')
