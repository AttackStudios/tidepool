/**
 * Reading the loader's log, and packaging a support bundle from it.
 *
 * The Discord rules and ticket flow both ask users to attach their log and mod
 * list. The app already knows where both live, so making someone go hunting for
 * them is needless friction — and the answer that comes back is usually
 * incomplete anyway.
 *
 * Both loaders are handled. That is not hypothetical tidiness: TidePool ships
 * MelonLoader, MelonLoader writes to a different path entirely, and until this
 * looked there the Logs tab and every support bundle came back empty for
 * everyone actually using it.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { GameInstall, Profile } from '../../shared/types'

/** Logs can reach tens of megabytes; only the tail is ever useful. */
export const MAX_LOG_BYTES = 256 * 1024

export interface LogLine {
  raw: string
  level: 'error' | 'warning' | 'info'
  /** Best guess at which plugin emitted it, from BepInEx's `[Level: Source]` prefix. */
  source: string | null
}

export interface LogReadResult {
  path: string | null
  truncated: boolean
  sizeBytes: number
  lines: LogLine[]
}

/** BepInEx prefixes every line `[Level: Source]`. */
const BEPINEX_RE = /^\s*\[(Fatal|Error|Warning|Message|Info|Debug)\s*:\s*([^\]]*)\]/i

/**
 * MelonLoader prefixes a timestamp and then one bracket that is *either* the
 * level or the mod's name — `[13:42:01.220] [ERROR] …` and
 * `[13:42:01.220] [SurfMP] …` are both ordinary lines.
 */
const MELON_RE = /^\s*\[\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\]\s*\[([^\]]+)\]/

export function parseLine(raw: string): LogLine {
  const bep = BEPINEX_RE.exec(raw)
  if (bep) {
    const word = bep[1]?.toLowerCase()
    return {
      raw,
      level: word === 'fatal' || word === 'error' ? 'error' : word === 'warning' ? 'warning' : 'info',
      source: bep[2]?.trim() || null,
    }
  }

  const melon = MELON_RE.exec(raw)
  if (melon) {
    const tag = (melon[1] ?? '').trim()
    const word = tag.toLowerCase()
    // The one bracket is the level when it names one, and the mod otherwise.
    if (word === 'error' || word === 'fatal') return { raw, level: 'error', source: null }
    if (word === 'warning' || word === 'warn') return { raw, level: 'warning', source: null }
    return { raw, level: 'info', source: tag || null }
  }

  return { raw, level: 'info', source: null }
}

/**
 * Where a log might be, best candidate first.
 *
 * MelonLoader keeps `MelonLoader/Latest.log` in the game folder — it is not
 * per-profile, because MelonLoader itself is not. BepInEx writes beside the
 * BepInEx folder it loaded from, which Doorstop points at the profile, though
 * the game folder is worth checking too for anyone who installed it by hand.
 *
 * MelonLoader comes first because it is the loader TidePool ships.
 */
export function candidatePaths(profileDir: string, gameRoot?: string | null): string[] {
  const paths: string[] = []
  if (gameRoot) paths.push(join(gameRoot, 'MelonLoader', 'Latest.log'))
  paths.push(join(profileDir, 'BepInEx', 'LogOutput.log'))
  if (gameRoot) paths.push(join(gameRoot, 'BepInEx', 'LogOutput.log'))
  return paths
}

/**
 * Read the last `MAX_LOG_BYTES` of a file without loading the rest.
 *
 * The size is already known from `stat`, so reading the whole thing only to
 * throw most of it away is waste that grows with the user's problem: a mod stuck
 * in an error loop writes the biggest logs, and past roughly 512 MB the read
 * fails outright on string length — leaving the Logs tab blank for exactly the
 * person who most needs it.
 */
function readTail(path: string, size: number): string {
  if (size <= MAX_LOG_BYTES) return readFileSync(path, 'utf8')

  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.allocUnsafe(MAX_LOG_BYTES)
    const read = readSync(fd, buffer, 0, MAX_LOG_BYTES, size - MAX_LOG_BYTES)
    const text = buffer.subarray(0, read).toString('utf8')
    // The cut lands mid-line, and possibly mid-character. Starting at the first
    // newline drops both problems at the cost of one partial line.
    const firstBreak = text.indexOf('\n')
    return firstBreak === -1 ? text : text.slice(firstBreak + 1)
  } finally {
    closeSync(fd)
  }
}

export function readLog(profileDir: string, gameRoot?: string | null): LogReadResult {
  const present = candidatePaths(profileDir, gameRoot).filter((p) => existsSync(p))
  // An empty file must not mask a real one. MelonLoader creates `Latest.log` the
  // moment it loads, so on a run that produced no output it exists and says
  // nothing — while a BepInEx log sitting beside it may have the answer.
  const path = present.find((p) => {
    try { return statSync(p).size > 0 } catch { return false }
  }) ?? present[0]
  if (!path) return { path: null, truncated: false, sizeBytes: 0, lines: [] }

  try {
    const size = statSync(path).size
    return {
      path,
      truncated: size > MAX_LOG_BYTES,
      sizeBytes: size,
      lines: readTail(path, size).split(/\r?\n/).filter((l) => l.length > 0).map(parseLine),
    }
  } catch {
    // An unreadable log shouldn't break the screen that exists to show it.
    return { path, truncated: false, sizeBytes: 0, lines: [] }
  }
}

export interface BundleInput {
  profile: Profile | null
  game: GameInstall | null
  log: LogReadResult
  appVersion: string
  platform: string
}

/**
 * A paste-ready support bundle.
 *
 * Deliberately plain text with the errors pulled to the top: whoever reads this
 * in a Discord ticket wants the failure first and the inventory second.
 */
export function buildSupportBundle(input: BundleInput): string {
  const { profile, game, log, appVersion, platform } = input
  const errors = log.lines.filter((l) => l.level === 'error')
  const out: string[] = []

  out.push('### TidePool support bundle')
  out.push('')
  out.push(`TidePool ${appVersion} on ${platform}`)
  out.push(`Game: ${game ? `${game.root} (${game.backend ?? 'backend unknown'})` : 'not found'}`)
  out.push(`Profile: ${profile ? `${profile.name} — ${profile.mods.length} mod(s)` : 'none'}`)
  out.push(`Log: ${log.path ?? 'not found'}${log.truncated ? ' (tail only)' : ''}`)
  out.push('')

  if (errors.length > 0) {
    out.push(`### Errors (${errors.length})`)
    out.push('```')
    // The last handful are the ones that matter; earlier ones are usually noise.
    for (const line of errors.slice(-15)) out.push(line.raw)
    out.push('```')
    out.push('')
  } else if (log.path) {
    out.push('No errors in the log.')
    out.push('')
  }

  out.push('### Mods')
  if (!profile || profile.mods.length === 0) {
    out.push('None installed.')
  } else {
    out.push('```')
    for (const m of profile.mods) {
      const flags = [m.enabled ? null : 'disabled', m.viaDependency ? 'dependency' : null]
        .filter(Boolean)
        .join(', ')
      out.push(`${m.fullName} ${m.version}${flags ? `  (${flags})` : ''}`)
    }
    out.push('```')
  }

  return out.join('\n')
}
