/**
 * Reading BepInEx's log, and packaging a support bundle from it.
 *
 * The Discord rules and ticket flow both ask users to attach
 * `BepInEx/LogOutput.log` and their mod list. The app already knows where both
 * live, so making someone go hunting for them is needless friction — and the
 * answer that comes back is usually incomplete anyway.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
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

const LEVEL_RE = /^\s*\[(Fatal|Error|Warning|Message|Info|Debug)\s*:\s*([^\]]*)\]/i

export function parseLine(raw: string): LogLine {
  const m = LEVEL_RE.exec(raw)
  const word = m?.[1]?.toLowerCase()
  const level: LogLine['level'] =
    word === 'fatal' || word === 'error' ? 'error' : word === 'warning' ? 'warning' : 'info'
  return { raw, level, source: m?.[2]?.trim() || null }
}

/**
 * BepInEx writes its log beside the BepInEx folder it loaded from. Doorstop is
 * pointed at the profile, so that is where it lands — but check the game folder
 * too, for anyone who installed BepInEx by hand.
 */
export function candidatePaths(profileDir: string, gameRoot?: string | null): string[] {
  const paths = [join(profileDir, 'BepInEx', 'LogOutput.log')]
  if (gameRoot) paths.push(join(gameRoot, 'BepInEx', 'LogOutput.log'))
  return paths
}

export function readLog(profileDir: string, gameRoot?: string | null): LogReadResult {
  for (const path of candidatePaths(profileDir, gameRoot)) {
    if (!existsSync(path)) continue
    try {
      const size = statSync(path).size
      const text = readFileSync(path, 'utf8')
      const tail = size > MAX_LOG_BYTES ? text.slice(-MAX_LOG_BYTES) : text
      return {
        path,
        truncated: size > MAX_LOG_BYTES,
        sizeBytes: size,
        lines: tail.split(/\r?\n/).filter((l) => l.length > 0).map(parseLine),
      }
    } catch {
      // An unreadable log shouldn't break the screen that exists to show it.
      return { path, truncated: false, sizeBytes: 0, lines: [] }
    }
  }
  return { path: null, truncated: false, sizeBytes: 0, lines: [] }
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
