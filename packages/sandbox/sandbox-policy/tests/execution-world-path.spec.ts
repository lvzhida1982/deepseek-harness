import { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import { describe, expect, it } from 'vitest'

function foreignSession(cwd: string): Session {
  const id = SessionId('windows-execution-world')
  return {
    id,
    header: {
      version: 0,
      id,
      createdAt: 0,
      cwd,
    },
    events: [],
  } as unknown as Session
}

async function mounted(workspaceRoot?: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SandboxPolicyService, workspaceRoot === undefined ? {} : { workspaceRoot })
  return ctx
}

describe('sandbox policy execution-world paths', () => {
  it('preserves a Windows session cwd when the Harness host is POSIX', async () => {
    const ctx = await mounted('/fallback')
    const cwd = String.raw`D:\Project`

    expect(ctx.sandboxPolicy.resolve({ session: foreignSession(cwd) }).workspaceRoot).toBe(cwd)
  })

  it('preserves a Windows configured fallback root when the Harness host is POSIX', async () => {
    const root = String.raw`D:\Fallback`
    const ctx = await mounted(root)

    expect(ctx.sandboxPolicy.workspaceRoot).toBe(root)
    expect(ctx.sandboxPolicy.resolve().workspaceRoot).toBe(root)
  })
})
