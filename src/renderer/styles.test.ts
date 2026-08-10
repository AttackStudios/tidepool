import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')

/** Strip comments so they can't be mistaken for selectors. */
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Rough CSS specificity: [ids, classes+pseudo-classes, elements]. */
function specificity(selector: string): [number, number, number] {
  if (/^\s*:where\(/.test(selector)) return [0, 0, 0]
  const b =
    (selector.match(/\.[a-zA-Z][\w-]*/g) ?? []).length +
    (selector.match(/:(?!:)(?:hover|active|focus|focus-visible|checked|disabled|not)\b/g) ?? []).length
  const c = (selector.match(/(?:^|[\s,>+~])[a-z]+[0-9]?(?=[\s.:,[]|$)/g) ?? []).length
  return [0, b, c]
}

const gte = (a: number[], b: number[]) =>
  a[0]! !== b[0]! ? a[0]! > b[0]! : a[1]! !== b[1]! ? a[1]! > b[1]! : a[2]! >= b[2]!

describe('stylesheet cascade', () => {
  it('keeps generic button states at zero specificity', () => {
    // `.card` is a <button>. Written plainly, `button:hover` scores (0,3,1) and
    // beats `.card:hover` at (0,2,0) — which painted mod cards near-white on
    // hover and hid their own text. :where() makes the generic rule a default.
    const generic = stripped.match(/^[^\n{}]*\bbutton:(?:hover|active)[^\n{}]*\{/gm) ?? []
    const bare = generic.filter((r) => !r.trim().startsWith(':where('))
    expect(bare).toEqual([])
  })

  it('lets every component override the default button hover', () => {
    for (const cls of ['.card', '.tab', '.toast__close', '.button--ghost', '.button--danger']) {
      const rule = stripped.match(
        new RegExp(`^[^\\n{}]*\\${cls}:hover[^\\n{}]*\\{`, 'm'),
      )
      expect(rule, `${cls} should define its own hover`).not.toBeNull()
      expect(gte(specificity(rule![0]), [0, 1, 0])).toBe(true)
    }
  })

  it('never paints a near-white background on a text-bearing card', () => {
    const cardHover = stripped.match(/\.card:hover\s*\{[^}]*\}/)?.[0] ?? ''
    expect(cardHover).toContain('--panel-hi')
    expect(cardHover).not.toContain('--foam')
  })
})
