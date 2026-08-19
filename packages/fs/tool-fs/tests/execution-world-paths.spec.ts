import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sessionCwd } from '../src/session-cwd.ts'

const WINDOWS_CWD = String.raw`D:\Project\packages\app`
const WINDOWS_PARENT_REQUEST = String.raw`..\shared.txt`

const execution = (cwd: string) => ({
  agent: {
    session: {
      header: { cwd },
    },
  },
})

describe('tool-fs execution-world cwd', () => {
  it('does not let a Host path with the same spelling rewrite a Windows execution-world cwd', () => {
    if (process.platform === 'win32') return

    // On POSIX this is one perfectly legal directory name containing ':' and '\\'.
    // Its existence makes the current Host realpath branch deterministic instead
    // of merely "usually harmless because the foreign path does not exist".
    mkdirSync(WINDOWS_CWD)
    try {
      expect(sessionCwd(execution(WINDOWS_CWD) as never, WINDOWS_PARENT_REQUEST))
        .toBe(WINDOWS_CWD)
      expect(resolve(WINDOWS_CWD)).not.toBe(WINDOWS_CWD)
    } finally {
      rmSync(WINDOWS_CWD, { recursive: true, force: true })
    }
  })
})
