/**
 * Cross-execution-world Session creation must not materialize the Session cwd
 * in the Harness Host filesystem before the agent composition chooses the
 * execution world that owns that path.
 */

import { existsSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type AgentFactory } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createApiProxy } from '../src/api-proxy.ts'
import { RpcId, type RpcRequest } from '../src/api/rpc.ts'
import { describe, expect, it } from 'vitest'

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId('execution-world-cwd'), payload }
}

function stubAgent(session: Session): Agent {
  return { id: session.id, session, status: 'idle' } as unknown as Agent
}

async function harness(cwd: string) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  ctx.provide('workspaceRegistry', {
    list: () => [],
    get: () => undefined,
  } as never)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, options) {
      const session = ctx.sessions.create(
        options.sessionId,
        options.meta === undefined ? {} : { meta: options.meta },
      )
      const agent = stubAgent(session)
      const agentCtx = ctx.extend({ agent })
      ;(agent as { ctx?: Context }).ctx = agentCtx
      await options.setup?.(agentCtx)
      const unregister = ctx.agents.register(agent)
      return { agent, dispose: () => { unregister(); return Promise.resolve() } }
    },
    async resume() {
      throw new Error('test harness has no persisted sessions')
    },
  }
  ctx.agents.setFactory(factory)

  return {
    ctx,
    api: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
      cwd,
    }),
  }
}

describe('ApiProxy fresh Session execution-world cwd', () => {
  it('does not create a Windows execution-world cwd on a POSIX Harness Host', async () => {
    if (process.platform === 'win32') return

    // POSIX treats the colon and backslashes as ordinary filename characters,
    // so the current Host mkdir(cwd) would create exactly this accidental
    // directory under the repository checkout.
    const cwd = String.raw`D:\dsh-world-${randomUUID()}`
    rmSync(cwd, { recursive: true, force: true })
    const { api, ctx } = await harness(cwd)
    try {
      expect(existsSync(cwd)).toBe(false)
      const response = await api.sessions.create(request({ sessionId: SessionId('execution-world-cwd') }))
      expect(response.result.ok).toBe(true)
      expect(ctx.sessions.get(SessionId('execution-world-cwd'))?.header.cwd).toBe(cwd)
      expect(existsSync(cwd)).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
