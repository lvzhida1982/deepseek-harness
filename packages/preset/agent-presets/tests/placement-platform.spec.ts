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
import AgentPresets, { type PresetPlacement } from '@deepseek-ai/dsh-agent-presets'
import { createScope, scopeOf, type Scope, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { describe, expect, it } from 'vitest'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [
  { path: join(FIXTURES, 'placement'), trust: 'user' as const },
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
  await ctx.plugin(AgentPresets, { default: 'platform-aware', roots: ROOTS, includeUserRoot: false })
  return ctx
}

interface ExecutionWorld {
  readonly key: ScopeKey
  readonly scope: Scope
  readonly placement: PresetPlacement
}

function executionWorld(ctx: Context, label: string, platform: NodeJS.Platform): ExecutionWorld {
  const isolated = ctx.isolate('worldMarker').isolate('executionPlatform')
  const key: ScopeKey = { executionWorld: label }
  const scope = createScope(isolated, key)
  scope.ctx.effect(() => scope.ctx.reflect.provide('worldMarker', { label }))
  scope.ctx.effect(() => scope.ctx.reflect.provide('executionPlatform', { platform }))
  return { key, scope, placement: { ctx: scope.ctx, parent: key } }
}

function agentIn(world: ExecutionWorld, id: string): Agent {
  const scope = createScope(world.scope.ctx, { agent: id })
  return { ctx: scope.ctx } as Agent
}

function toolNames(ctx: Context, agent: Agent): string[] {
  const key = scopeOf(agent.ctx)
  if (key === undefined) throw new Error('fixture agent has no scope')
  return ctx.tools.schemas(key).map(schema => schema.name).sort()
}

describe('preset platform gating through placement context', () => {
  it('lets one preset select different rows from each execution world instead of the Harness host', async () => {
    const ctx = await harness()
    const linux = executionWorld(ctx, 'linux-world', 'linux')
    const windows = executionWorld(ctx, 'windows-world', 'win32')
    const linuxAgent = agentIn(linux, 'linux-agent')
    const windowsAgent = agentIn(windows, 'windows-agent')

    await ctx.agentPresets.mount(linuxAgent.ctx, 'platform-aware', linux.placement)
    await ctx.agentPresets.mount(windowsAgent.ctx, 'platform-aware', windows.placement)

    expect(toolNames(ctx, linuxAgent)).toEqual(['bash-linux-world'])
    expect(toolNames(ctx, windowsAgent)).toEqual(['pwsh-windows-world'])
  })
})
