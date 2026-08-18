import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import { describe, expect, it } from 'vitest'

describe('local sandbox owns host-path canonicalization', () => {
  it.skipIf(process.platform === 'win32')('canonicalizes a symlink-sensitive workspace root before building the runner argv', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-local-sandbox-root-'))
    try {
      const lexical = join(root, 'lexical')
      const physical = join(root, 'physical')
      const child = join(physical, 'child')
      mkdirSync(lexical)
      mkdirSync(child, { recursive: true })
      const link = join(lexical, 'link')
      symlinkSync(child, link, 'dir')
      const spelledRoot = `${link}${sep}..`
      const policy: SandboxPolicy = { mode: 'workspace-write', workspaceRoot: spelledRoot }

      const ctx = new Context()
      await ctx.plugin(LocalSandboxProvider, {
        runnerCommand: ['fake-runner'],
        runnerFailureSignatures: ['fake-runner: rejected'],
      })

      const confined = ctx.sandbox.confine(['true'], policy)
      const canonical = realpathSync.native(physical)
      expect(confined.argv).toContain(canonical)
      expect(confined.argv).not.toContain(spelledRoot)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
