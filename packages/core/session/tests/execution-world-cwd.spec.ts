import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx
}

describe('execution-world cwd', () => {
  it.each([
    ['/home/user/project', 'POSIX absolute'],
    [String.raw`D:\Projects\PersonalAgent`, 'Windows drive absolute'],
    [String.raw`D:/Projects/PersonalAgent`, 'Windows drive absolute with slash separators'],
    [String.raw`\\server\share\project`, 'Windows UNC absolute'],
  ])('accepts %s as an execution-world absolute cwd (%s)', (cwd) => {
    const ctx = new Context()
    return ctx.plugin(SessionStore).then(() => {
      const id = SessionId(`absolute-${Math.random()}`)
      expect(() => ctx.sessions.create(id, { meta: { cwd } })).not.toThrow()
      expect(ctx.sessions.get(id)?.header.cwd).toBe(cwd)
    })
  })

  it.each([
    ['relative/project', 'ordinary relative path'],
    [String.raw`D:relative\project`, 'Windows drive-relative path'],
  ])('rejects %s (%s)', async (cwd) => {
    const ctx = await harness()
    expect(() => ctx.sessions.create(SessionId(`relative-${Math.random()}`), {
      meta: { cwd },
    })).toThrow(`session header cwd must be an absolute path, got "${cwd}"`)
  })
})
