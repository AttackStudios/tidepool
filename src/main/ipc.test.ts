import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ipc = readFileSync(join(__dirname, 'ipc.ts'), 'utf8')
const preload = readFileSync(join(__dirname, 'preload.ts'), 'utf8')

const channelBlock = /export const CHANNELS = \{([\s\S]*?)\} as const/.exec(ipc)![1]!
const declared = new Map(
  [...channelBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1]!, m[2]!]),
)
/** Allow newlines between the paren and the channel — handlers are often wrapped. */
const handled = new Set([...ipc.matchAll(/ipcMain\.handle\(\s*CHANNELS\.(\w+)/g)].map((m) => m[1]!))
const invoked = new Set([...preload.matchAll(/ipcRenderer\.invoke\(\s*CHANNELS\.(\w+)/g)].map((m) => m[1]!))

/** Pushed from main to the renderer, so it never gets an ipcMain.handle. */
const SEND_ONLY = new Set(['installProgress'])

describe('IPC wiring', () => {
  it('registers a handler for every channel the renderer invokes', () => {
    // This exists because a whole feature once shipped with its handlers
    // missing: typecheck passed, 234 tests passed, and the tab was dead at
    // runtime with "No handler registered for 'beaches:list'". Nothing else
    // connects the two halves of the bridge.
    const missing = [...invoked].filter((c) => !handled.has(c))
    expect(missing, `preload invokes these with no handler: ${missing.join(', ')}`).toEqual([])
  })

  it('has a handler for every declared channel', () => {
    const missing = [...declared.keys()].filter((c) => !handled.has(c) && !SEND_ONLY.has(c))
    expect(missing, `declared but never handled: ${missing.join(', ')}`).toEqual([])
  })

  it('declares every channel the preload references', () => {
    const undeclared = [...invoked].filter((c) => !declared.has(c))
    expect(undeclared).toEqual([])
  })

  it('uses distinct channel strings', () => {
    // Two channels sharing a string means one silently shadows the other.
    const values = [...declared.values()]
    expect(new Set(values).size).toBe(values.length)
  })

  it('covers the features that were broken', () => {
    for (const c of ['listBeaches', 'readLog', 'essentialDetail', 'installEssential', 'appVersion']) {
      expect(handled.has(c), `${c} must be registered`).toBe(true)
    }
  })
})
