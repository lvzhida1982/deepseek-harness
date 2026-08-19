import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { describe, expect, it, vi } from 'vitest'
import { createApiProxy } from '../src/api-proxy.ts'
import { RpcId, type RpcRequest } from '../src/api/rpc.ts'

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId('execution-world-offline-history'), payload }
}

describe('ExecutionWorld offline cold history', () => {
  it('reads durable history without resuming an Agent when placement is unavailable', async () => {
    const sessionId = SessionId('offline-world-session')
    const meta = {
      version: 0,
      id: sessionId,
      createdAt: 1,
      cwd: 'D:\\Project',
      agentPreset: 'standard',
    }

    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(UserQuestionService)

    ctx.provide('sessionPersistence', {
      list: () => Promise.resolve([meta]),
      inspect: () => Promise.resolve({ meta, events: [] }),
      locate: () => undefined,
    } as never)

    let standingKeyCalls = 0
    ctx.provide('agentPresets', {
      defaultId: 'standard',
      list: () => Promise.resolve([{ id: 'standard', trust: 'system', path: '/presets/standard/agent.cordis.yml' }]),
      standingKeyFor: () => {
        standingKeyCalls++
        throw new Error('execution world offline')
      },
    } as never)

    const resolveSessionPlacement = vi.fn(() => Promise.reject(new Error('device offline')))
    const resume = vi.spyOn(ctx.agents, 'resume')
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
      cwd: '/host/default',
      resolveSessionPlacement,
    })

    const response = await api.sessions.history(request({ sessionId }))

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) throw new Error('unreachable')
    expect(response.result.value).toMatchObject({ events: [], hasMore: false })
    expect(resolveSessionPlacement).toHaveBeenCalledWith({ sessionId, cwd: 'D:\\Project' })
    expect(standingKeyCalls).toBe(0)
    expect(resume).not.toHaveBeenCalled()
    expect(ctx.sessions.get(sessionId)).toBeUndefined()

    await ctx.fiber.dispose()
  })
})
