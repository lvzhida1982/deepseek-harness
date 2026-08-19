import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sessionCwd, sessionResolveOptions } from '../src/session-cwd.ts'

const WINDOWS_CWD = String.raw`D:\Project\packages\app`
const WINDOWS_PARENT_REQUEST = String.raw`..\shared.txt`

const execution = (cwd: string) => ({
  agent: {
    session: {
      header: { cwd },
    },
  },
})

function sameWorldFs(resolveCalls: string[]) {
  return {
    async resolve(path: string) {
      resolveCalls.push(path)
      return { targetKey: path, displayPath: path }
    },
    processPath(target: { targetKey: unknown }) {
      return String(target.targetKey)
    },
  }
}

describe('tool-fs execution-world cwd', () => {
  it('does not let a Host path with the same spelling rewrite a Windows execution-world cwd', async () => {
    if (process.platform === 'win32') return

    // On POSIX this is one perfectly legal directory name containing ':' and '\\'.
    // Its existence makes any accidental Host realpath deterministic instead of
    // merely "usually harmless because the foreign path does not exist".
    mkdirSync(WINDOWS_CWD)
    const resolveCalls: string[] = []
    try {
      expect(await sessionCwd(
        sameWorldFs(resolveCalls) as never,
        execution(WINDOWS_CWD) as never,
        WINDOWS_PARENT_REQUEST,
      )).toBe(WINDOWS_CWD)
      expect(resolveCalls).toEqual([WINDOWS_CWD])
      expect(resolve(WINDOWS_CWD)).not.toBe(WINDOWS_CWD)
    } finally {
      rmSync(WINDOWS_CWD, { recursive: true, force: true })
    }
  })

  it('does not add a provider cwd round-trip for an ordinary child path', async () => {
    const resolveCalls: string[] = []
    const options = await sessionResolveOptions(
      sameWorldFs(resolveCalls) as never,
      execution(WINDOWS_CWD) as never,
      'child.txt',
    )
    expect(options.cwd).toBe(WINDOWS_CWD)
    expect(resolveCalls).toEqual([])
  })
})
