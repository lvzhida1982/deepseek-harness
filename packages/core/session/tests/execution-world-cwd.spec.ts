import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx
}

describe('execution-world cwd', () => {
  it('accepts a Windows absolute cwd even when the Harness host is POSIX', async () => {
    const ctx = await harness()
    const cwd = String.raw`D:\Projects\PersonalAgent`

    expect(() => ctx.sessions.create(SessionId('windows-execution-world'), {
      meta: { cwd },
    })).not.toThrow()

    expect(ctx.sessions.get(SessionId('windows-execution-world'))?.header.cwd).toBe(cwd)
  })
})
