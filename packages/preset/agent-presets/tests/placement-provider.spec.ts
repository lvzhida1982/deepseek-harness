import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets, { type PresetPlacement } from '@deepseek-ai/dsh-agent-presets'
import { createScope, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { describe, expect, it } from 'vitest'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'placement'), trust: 'user' as const }]

async function harness(): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { default: 'world-aware', roots: ROOTS, includeUserRoot: false })
  return ctx
}

function world(ctx: Context, label: string): PresetPlacement {
  const isolated = ctx.isolate('worldMarker')
  const parent: ScopeKey = { executionWorld: label }
  const scope = createScope(isolated, parent)
  scope.ctx.effect(() => scope.ctx.reflect.provide('worldMarker', { label }))
  return { ctx: scope.ctx, parent }
}

function toolNames(ctx: Context, agentOrScope: Agent | ScopeKey): string[] {
  return ctx.tools.schemas(agentOrScope as ScopeKey).map(schema => schema.name).sort()
}

function detachedHeader(id: string, cwd: string): SessionHeader {
  return {
    version: 0,
    id: SessionId(id),
    createdAt: 1,
    cwd,
    agentPreset: 'world-aware',
  }
}

describe('agent preset placement provider', () => {
  it('automatically places real unpublished agents without changing existing mount callers', async () => {
    const ctx = await harness()
    const a = world(ctx, 'A')
    const b = world(ctx, 'B')
    const agentCalls: string[] = []

    ctx.provide('agentPresetPlacement', {
      forAgent(agentCtx) {
        const cwd = agentCtx.agent?.session.header.cwd
        agentCalls.push(cwd ?? 'missing')
        return cwd === '/world-a' ? a : b
      },
      forSession() {
        throw new Error('cold resolver must not run for live Agent mount')
      },
    } as never)

    const handleA = await ctx.agents.create({
      sessionId: SessionId('provider-a'),
      meta: { cwd: '/world-a' },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'world-aware').then(() => undefined),
    })
    const handleB = await ctx.agents.create({
      sessionId: SessionId('provider-b'),
      meta: { cwd: '/world-b' },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'world-aware').then(() => undefined),
    })

    try {
      expect(toolNames(ctx, handleA.agent)).toEqual(['world-A'])
      expect(toolNames(ctx, handleB.agent)).toEqual(['world-B'])
      expect(agentCalls).toEqual(['/world-a', '/world-b'])
    } finally {
      await handleA.dispose()
      await handleB.dispose()
    }
  })

  it('resolves cold presenter scope from detached session facts without resuming an Agent', async () => {
    const ctx = await harness()
    const a = world(ctx, 'A')
    const b = world(ctx, 'B')
    const coldCalls: string[] = []

    ctx.provide('agentPresetPlacement', {
      forAgent() {
        throw new Error('live resolver must not run for cold standing lookup')
      },
      forSession(session) {
        const cwd = session.header.cwd ?? 'missing'
        coldCalls.push(cwd)
        return cwd === '/world-a' ? a : b
      },
    } as never)

    const keyA = await ctx.agentPresets.standingKeyForSession({
      header: detachedHeader('cold-a', '/world-a'),
      events: [],
    })
    const keyB = await ctx.agentPresets.standingKeyForSession({
      header: detachedHeader('cold-b', '/world-b'),
      events: [],
    })

    expect(toolNames(ctx, keyA)).toEqual(['world-A'])
    expect(toolNames(ctx, keyB)).toEqual(['world-B'])
    expect(coldCalls).toEqual(['/world-a', '/world-b'])
    expect(ctx.agents.get(SessionId('cold-a'))).toBeUndefined()
    expect(ctx.agents.get(SessionId('cold-b'))).toBeUndefined()
  })
})
