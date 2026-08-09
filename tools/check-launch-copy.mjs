/**
 * Fails if any launch copy still contains an unfilled {{PLACEHOLDER}}.
 *
 * These files get pasted into Steam, Thunderstore and Discord by hand on a busy
 * day; posting one with a raw placeholder in it is both embarrassing and a dead
 * link. Cheap to check, so check.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'docs/launch'
const PLACEHOLDER = /\{\{[A-Z_]+\}\}/g
// The checklist documents the convention, so it is expected to contain examples.
const ALLOWED = new Set(['00-checklist.md'])

let found = 0
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  if (ALLOWED.has(file)) continue
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const match of line.matchAll(PLACEHOLDER)) {
      console.error(`${DIR}/${file}:${i + 1}  unfilled ${match[0]}`)
      found++
    }
  })
}

if (found > 0) {
  console.error(`\n${found} unfilled placeholder(s). Fill them in before publishing.`)
  process.exit(1)
}
console.log('Launch copy is ready to publish — no unfilled placeholders.')
