import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../src/index.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
}

function replaceAllExact(before, after, expectedCount, label) {
  const parts = source.split(before)
  const count = parts.length - 1
  if (count !== expectedCount) throw new Error(`${label}：预期 ${expectedCount} 处，实际 ${count} 处`)
  source = parts.join(after)
}

replaceExact(
`export interface AgentPresetSettings {
  /** Preset mounted when a session names none. */
  default?: string
}
`,
`export interface AgentPresetSettings {
  /** Preset mounted when a session names none. */
  default?: string
}

/** Runtime location under which one standing preset generation is composed. */
export interface PresetPlacement {
  /** Cordis context that owns the preset's service ancestry. */
  readonly ctx: Context
  /** dsh-scope parent that owns the preset's registry/event ancestry. */
  readonly parent: ScopeKey
}
`,
'插入 PresetPlacement',
)

replaceExact(
`  private readonly standing = new Map<string, Promise<StandingMount>>()
`,
`  private readonly standing = new Map<string, Promise<StandingMount>>()

  /** Standing-generation buckets owned by non-host placements. */
  private readonly placedStanding = new WeakMap<ScopeKey, PlacementStanding>()

  /** Iterable live placement buckets, used only for roster invalidation. */
  private readonly placedBuckets = new Set<Map<string, Promise<StandingMount>>>()

  /** Placement that owns each standing scope key; null means the host plane. */
  private readonly standingPlacements = new WeakMap<ScopeKey, PresetPlacement | null>()

  /** Placement retained by each composed agent so recompose cannot move worlds. */
  private readonly agentPlacements = new WeakMap<ScopeKey, PresetPlacement | null>()
`,
'插入 placement 缓存',
)

replaceExact(
`  async mount(agentCtx: Context, id?: string): Promise<AgentPreset> {
`,
`  async mount(agentCtx: Context, id?: string, placement?: PresetPlacement): Promise<AgentPreset> {
`,
'扩展 mount 参数',
)

replaceExact(
`    const standing = await this.ensureStanding(preset)
    // The one bind of this agent's ancestry. The binding is the only re-link
`,
`    const standing = await this.ensureStanding(preset, placement)
    // The one bind of this agent's ancestry. The binding is the only re-link
`,
'mount 使用 placement',
)

replaceExact(
`    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    return preset
  }

  /**
   * Join one agent to the SAME standing composition another already runs on.
`,
`    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    this.agentPlacements.set(agentKey, placement ?? null)
    return preset
  }

  /**
   * Join one agent to the SAME standing composition another already runs on.
`,
'mount 记录 placement',
)

replaceExact(
`    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    return standing.presetId
  }

  /**
   * The preset one live agent runs on.
`,
`    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    this.agentPlacements.set(agentKey, this.standingPlacements.get(standing.key) ?? null)
    return standing.presetId
  }

  /**
   * The preset one live agent runs on.
`,
'composeFrom 继承 placement',
)

replaceAllExact(
`    this.standing.delete(id)
`,
`    this.invalidateStanding(id)
`,
2,
'统一失效 standing 缓存',
)

replaceExact(
`  async recompose(agentCtx: Context, id: string): Promise<AgentPreset> {
    const agentKey = scopeOf(agentCtx)
    if (agentKey === undefined) {
      throw new Error('agent-presets: refusing to recompose an unscoped context')
    }
    const preset = await this.resolveMountable(id)
    const standing = await this.ensureStanding(preset)
    const binding = this.bindings.get(agentKey)
    if (binding === undefined) {
      this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    } else {
      binding.rebind(standing.key)
    }
    return preset
  }
`,
`  async recompose(agentCtx: Context, id: string, placement?: PresetPlacement): Promise<AgentPreset> {
    const agentKey = scopeOf(agentCtx)
    if (agentKey === undefined) {
      throw new Error('agent-presets: refusing to recompose an unscoped context')
    }
    const binding = this.bindings.get(agentKey)
    const currentPlacement = this.agentPlacements.get(agentKey)
    const targetPlacement = binding === undefined ? placement : currentPlacement ?? undefined
    if (binding !== undefined && placement !== undefined && !samePlacement(targetPlacement, placement)) {
      throw new Error('agent-presets: refusing to move a composed agent to a different preset placement')
    }
    const preset = await this.resolveMountable(id)
    const standing = await this.ensureStanding(preset, targetPlacement)
    if (binding === undefined) {
      this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    } else {
      binding.rebind(standing.key)
    }
    this.agentPlacements.set(agentKey, targetPlacement ?? null)
    return preset
  }
`,
'扩展 recompose',
)

replaceExact(
`  async standingKeyFor(id?: string): Promise<ScopeKey> {
    const preset = await this.resolveMountable(id)
    return (await this.ensureStanding(preset)).key
  }

  /** Resolve (or create, single-flight) the standing mount of one preset. */
  private async ensureStanding(preset: AgentPreset): Promise<StandingMount> {
    const pending = this.standing.get(preset.id)
`,
`  async standingKeyFor(id?: string, placement?: PresetPlacement): Promise<ScopeKey> {
    const preset = await this.resolveMountable(id)
    return (await this.ensureStanding(preset, placement)).key
  }

  /** Resolve (or create, single-flight) the standing mount of one preset. */
  private async ensureStanding(preset: AgentPreset, placement?: PresetPlacement): Promise<StandingMount> {
    const bucket = this.standingBucket(placement)
    const pending = bucket.get(preset.id)
`,
'扩展 standingKeyFor 与 ensureStanding',
)

replaceExact(
`      if (this.standing.get(preset.id) === pending) this.standing.delete(preset.id)
      return this.ensureStanding(preset)
`,
`      if (bucket.get(preset.id) === pending) bucket.delete(preset.id)
      return this.ensureStanding(preset, placement)
`,
'按 placement 刷新 generation',
)

replaceExact(
`      const key: ScopeKey = { agentPreset: preset.id }
      const scope = createScope(this.selfCtx, key)
`,
`      const key: ScopeKey = { agentPreset: preset.id }
      const scope = placement === undefined
        ? createScope(this.selfCtx, key)
        : createScope(placement.ctx, key, { parent: placement.parent })
`,
'按 placement 创建 scope',
)

replaceExact(
`        await mountPreset(scope.ctx, preset)
        return { key, scope, stamp }
      } catch (error) {
        this.standing.delete(preset.id)
`,
`        await mountPreset(scope.ctx, preset)
        this.standingPlacements.set(key, placement ?? null)
        return { key, scope, stamp }
      } catch (error) {
        bucket.delete(preset.id)
`,
'记录 standing placement',
)

replaceExact(
`    this.standing.set(preset.id, created)
    return created
  }
}
`,
`    bucket.set(preset.id, created)
    return created
  }

  /** Resolve the standing-generation bucket for one placement. */
  private standingBucket(placement?: PresetPlacement): Map<string, Promise<StandingMount>> {
    if (placement === undefined) return this.standing
    const cached = this.placedStanding.get(placement.parent)
    if (cached !== undefined) {
      if (cached.ctx !== placement.ctx) {
        throw new Error('agent-presets: one preset placement parent cannot name multiple Cordis contexts')
      }
      return cached.mounts
    }
    const mounts = new Map<string, Promise<StandingMount>>()
    this.placedStanding.set(placement.parent, { ctx: placement.ctx, mounts })
    this.placedBuckets.add(mounts)
    placement.ctx.effect(() => () => {
      this.placedBuckets.delete(mounts)
      mounts.clear()
    }, 'agentPresets.placementStanding()')
    return mounts
  }

  /** Drop only future lookup pointers; joined agents keep their live generation. */
  private invalidateStanding(id: string): void {
    this.standing.delete(id)
    for (const bucket of this.placedBuckets) bucket.delete(id)
  }
}
`,
'加入 placement bucket 管理',
)

replaceExact(
`interface StandingMount {
  /** Scope key agents are parented to; also the mount's registration scope. */
  readonly key: ScopeKey
  /** Disposal boundary; held for whole-tree teardown, never per-session. */
  readonly scope: Scope
  /** Stamp of the composition file this generation was mounted from. */
  readonly stamp: CompositionStamp
}

export default AgentPresets
`,
`interface StandingMount {
  /** Scope key agents are parented to; also the mount's registration scope. */
  readonly key: ScopeKey
  /** Disposal boundary; held for whole-tree teardown, never per-session. */
  readonly scope: Scope
  /** Stamp of the composition file this generation was mounted from. */
  readonly stamp: CompositionStamp
}

/** One non-host placement's standing-generation cache. */
interface PlacementStanding {
  readonly ctx: Context
  readonly mounts: Map<string, Promise<StandingMount>>
}

/** Whether two optional placements identify the same live runtime location. */
function samePlacement(a: PresetPlacement | undefined, b: PresetPlacement | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.ctx === b.ctx && a.parent === b.parent
}

export default AgentPresets
`,
'加入 placement 辅助类型',
)

await writeFile(path, source)
console.log('已生成 AgentPresets generalized placement 实验实现')
