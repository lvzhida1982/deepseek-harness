import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import { createScope, type Scope, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { describe, expect, it } from 'vitest'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [
  { path: join(FIXTURES, 'system'), trust: 'system' as const },
  { path: join(FIXTURES, 'user'), trust: 'user' as const },
]

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
  await ctx.plugin(AgentPresets, { default: 'standard', roots: ROOTS, includeUserRoot: false })
  return ctx
}

interface ExecutionWorld {
  readonly key: ScopeKey
  readonly scope: Scope
}

function executionWorld(ctx: Context, label: string): ExecutionWorld {
  const isolated = ctx.isolate('worldMarker')
  const key: ScopeKey = { executionWorld: label }
  const scope = createScope(isolated, key)
  scope.ctx.effect(() => scope.ctx.reflect.provide('worldMarker', { label }))
  return { key, scope }
}

function agentIn(world: ExecutionWorld, id: string): Agent {
  const scope = createScope(world.scope.ctx, { agent: id }, { parent: world.key })
  return { ctx: scope.ctx } as Agent
}

function toolNames(ctx: Context, agent: Agent): string[] {
  return ctx.tools.schemas(agent).map(schema => schema.name).sort()
}

type Placement = { ctx: Context, parent: ScopeKey }
type PlacementMount = (agentCtx: Context, id: string, placement: Placement) => Promise<unknown>

describe('agent preset placement', () => {
  it('mounts the same preset independently below two execution worlds', async () => {
    const ctx = await harness()
    const worldA = executionWorld(ctx, 'A')
    const worldB = executionWorld(ctx, 'B')
    const agentA = agentIn(worldA, 'agent-a')
    const agentB = agentIn(worldB, 'agent-b')

    // The cast deliberately expresses the proposed generalized placement seam.
    // On current master the third argument is ignored and the standing preset
    // is mounted from AgentPresets.selfCtx, so `worldMarker` cannot resolve and
    // this test stays red until placement is implemented.
    const mount = ctx.agentPresets.mount.bind(ctx.agentPresets) as unknown as PlacementMount

    await mount(agentA.ctx, 'world-aware', { ctx: worldA.scope.ctx, parent: worldA.key })
    await mount(agentB.ctx, 'world-aware', { ctx: worldB.scope.ctx, parent: worldB.key })

    expect(toolNames(ctx, agentA)).toEqual(['world-A'])
    expect(toolNames(ctx, agentB)).toEqual(['world-B'])
  })
})
