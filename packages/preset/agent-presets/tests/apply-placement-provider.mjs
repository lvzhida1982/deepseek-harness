import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../src/index.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (after !== '' && source.includes(after)) return
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
}

replaceExact(
`import { PresetMountError, UnknownPresetError, type AgentPreset, type Config, type PresetRoot } from './preset.ts'\nimport type {} from './types.ts'\n\n/** Settings namespace carrying the user's chosen default preset. */\n`,
`import { PresetMountError, UnknownPresetError, type AgentPreset, type Config, type PresetRoot } from './preset.ts'\nimport { resolveSessionPreset, type PresetBearingSession } from './session.ts'\nimport type { PresetPlacement } from './placement-provider.ts'\nimport type {} from './types.ts'\n\n/** Settings namespace carrying the user's chosen default preset. */\n`,
'引入 placement provider 类型与 session resolver',
)

replaceExact(
`/** Runtime location under which one standing preset generation is composed. */\nexport interface PresetPlacement {\n  /** Cordis context that owns the preset's service ancestry. */\n  readonly ctx: Context\n  /** dsh-scope parent that owns the preset's registry/event ancestry. */\n  readonly parent: ScopeKey\n}\n\n`,
'',
'移除 index 内旧的 PresetPlacement 定义',
)

replaceExact(
`export { resolveSessionPreset, type PresetBearingSession } from './session.ts'\n`,
`export { resolveSessionPreset, type PresetBearingSession } from './session.ts'\nexport { AgentPresetPlacementProvider, type PresetPlacement } from './placement-provider.ts'\n`,
'导出 placement provider seam',
)

replaceExact(
`    const preset = await this.resolveMountable(id)\n    const standing = await this.ensureStanding(preset, placement)\n`,
`    const preset = await this.resolveMountable(id)\n    const resolvedPlacement = placement\n      ?? await agentCtx.get('agentPresetPlacement')?.forAgent(agentCtx, preset)\n    const standing = await this.ensureStanding(preset, resolvedPlacement)\n`,
'mount 自动解析 placement',
)

replaceExact(
`    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))\n    this.agentPlacements.set(agentKey, placement ?? null)\n    return preset\n`,
`    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))\n    this.agentPlacements.set(agentKey, resolvedPlacement ?? null)\n    return preset\n`,
'mount 记录解析后的 placement',
)

replaceExact(
`    const binding = this.bindings.get(agentKey)\n    const currentPlacement = this.agentPlacements.get(agentKey)\n    const targetPlacement = binding === undefined ? placement : currentPlacement ?? undefined\n    if (binding !== undefined && placement !== undefined && !samePlacement(targetPlacement, placement)) {\n      throw new Error('agent-presets: refusing to move a composed agent to a different preset placement')\n    }\n    const preset = await this.resolveMountable(id)\n    const standing = await this.ensureStanding(preset, targetPlacement)\n`,
`    const binding = this.bindings.get(agentKey)\n    const currentPlacement = this.agentPlacements.get(agentKey)\n    const preset = await this.resolveMountable(id)\n    const targetPlacement = binding === undefined\n      ? placement ?? await agentCtx.get('agentPresetPlacement')?.forAgent(agentCtx, preset)\n      : currentPlacement ?? undefined\n    if (binding !== undefined && placement !== undefined && !samePlacement(targetPlacement, placement)) {\n      throw new Error('agent-presets: refusing to move a composed agent to a different preset placement')\n    }\n    const standing = await this.ensureStanding(preset, targetPlacement)\n`,
'recompose 初次绑定自动解析 placement',
)

replaceExact(
`  async standingKeyFor(id?: string, placement?: PresetPlacement): Promise<ScopeKey> {\n    const preset = await this.resolveMountable(id)\n    return (await this.ensureStanding(preset, placement)).key\n  }\n\n  /** Resolve (or create, single-flight) the standing mount of one preset. */\n`,
`  async standingKeyFor(id?: string, placement?: PresetPlacement): Promise<ScopeKey> {\n    const preset = await this.resolveMountable(id)\n    return (await this.ensureStanding(preset, placement)).key\n  }\n\n  /**\n   * Resolve a detached Session's standing key through the deployment placement\n   * policy without resuming an Agent. No provider preserves the historical host\n   * placement.\n   */\n  async standingKeyForSession(session: PresetBearingSession): Promise<ScopeKey> {\n    const preset = await this.resolveMountable(resolveSessionPreset(session))\n    const placement = await this.selfCtx.get('agentPresetPlacement')?.forSession(session, preset)\n    return (await this.ensureStanding(preset, placement)).key\n  }\n\n  /** Resolve (or create, single-flight) the standing mount of one preset. */\n`,
'增加 cold Session placement lookup',
)

await writeFile(path, source)
console.log('已生成 Agent Preset Placement Provider 实验实现')
