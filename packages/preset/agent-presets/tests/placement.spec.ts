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
import { PlacementPrototype, type PresetPlacement } from './placement-prototype.ts'

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
  readonly placement: PresetPlacement
}

function executionWorld(ctx: Context, label: string): ExecutionWorld {
  const isolated = ctx.isolate('worldMarker')
  const key: ScopeKey = { executionWorld: label }
  const scope = createScope(isolated, key)
  scope.ctx.effect(() => scope.ctx.reflect.provide('worldMarker', { label }))
  return { key, scope, placement: { ctx: scope.ctx, parent: key } }
}

function agentIn(world: ExecutionWorld, id: string): Agent {
  // Cordis ancestry starts in the execution world, but the dsh-scope parent is
  // intentionally left empty. PlacementPrototype owns the one authoritative
  // bind: Agent -> Preset -> ExecutionWorld.
  const scope = createScope(world.scope.ctx, { agent: id })
  return { ctx: scope.ctx } as Agent
}

function toolNames(ctx: Context, agent: Agent): string[] {
  return ctx.tools.schemas(agent).map(schema => schema.name).sort()
}

describe('agent preset placement prototype', () => {
  it('mounts the same preset independently below two execution worlds', async () => {
    const ctx = await harness()
    const placements = new PlacementPrototype(ctx.agentPresets)
    const worldA = executionWorld(ctx, 'A')
    const worldB = executionWorld(ctx, 'B')
    const agentA = agentIn(worldA, 'agent-a')
    const agentB = agentIn(worldB, 'agent-b')

    await placements.mount(agentA.ctx, 'world-aware', worldA.placement)
    await placements.mount(agentB.ctx, 'world-aware', worldB.placement)

    expect(toolNames(ctx, agentA)).toEqual(['world-A'])
    expect(toolNames(ctx, agentB)).toEqual(['world-B'])
  })

  it('shares a standing generation inside one world and separates worlds', async () => {
    const ctx = await harness()
    const placements = new PlacementPrototype(ctx.agentPresets)
    const worldA = executionWorld(ctx, 'A')
    const worldB = executionWorld(ctx, 'B')

    const a1 = await placements.standingKeyFor('world-aware', worldA.placement)
    const a2 = await placements.standingKeyFor('world-aware', worldA.placement)
    const b = await placements.standingKeyFor('world-aware', worldB.placement)

    expect(a2).toBe(a1)
    expect(b).not.toBe(a1)
  })

  it('lets a child inherit the exact parent world and standing generation', async () => {
    const ctx = await harness()
    const placements = new PlacementPrototype(ctx.agentPresets)
    const worldA = executionWorld(ctx, 'A')
    const parent = agentIn(worldA, 'parent')
    const child = agentIn(worldA, 'child')

    await placements.mount(parent.ctx, 'world-aware', worldA.placement)
    expect(placements.composeFrom(child.ctx, parent.ctx)).toBe('world-aware')

    expect(toolNames(ctx, parent)).toEqual(['world-A'])
    expect(toolNames(ctx, child)).toEqual(['world-A'])
  })

  it('recomposes the preset without changing the execution world', async () => {
    const ctx = await harness()
    const placements = new PlacementPrototype(ctx.agentPresets)
    const worldA = executionWorld(ctx, 'A')
    const agent = agentIn(worldA, 'agent-a')

    await placements.mount(agent.ctx, 'world-aware', worldA.placement)
    expect(toolNames(ctx, agent)).toEqual(['world-A'])

    await placements.recompose(agent.ctx, 'world-aware-alt')
    expect(toolNames(ctx, agent)).toEqual(['alt-A'])
  })
})
