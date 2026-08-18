import { type Context } from '@deepseek-ai/cordis'
import { bindScopeParent, createScope, scopeOf, type Scope, type ScopeKey, type ScopeParentBinding } from '@deepseek-ai/dsh-scope'
import { mountPreset, standingMountFor, type default as AgentPresets, type AgentPreset } from '@deepseek-ai/dsh-agent-presets'

export interface PresetPlacement {
  readonly ctx: Context
  readonly parent: ScopeKey
}

interface PrototypeStanding {
  readonly presetId: string
  readonly key: ScopeKey
  readonly scope: Scope
}

/**
 * Test-only proof of the generalized placement algorithm.
 *
 * This intentionally omits production generation-stamp invalidation; it exists
 * only to prove that current Cordis + dsh-scope + mountPreset primitives can
 * represent `execution world -> preset -> agent` without changing those lower
 * layers.
 */
export class PlacementPrototype {
  private readonly standing = new WeakMap<ScopeKey, Map<string, Promise<PrototypeStanding>>>()
  private readonly bindings = new WeakMap<ScopeKey, ScopeParentBinding>()
  private readonly placements = new WeakMap<ScopeKey, PresetPlacement>()

  constructor(private readonly presets: AgentPresets) {}

  async mount(agentCtx: Context, id: string, placement: PresetPlacement): Promise<AgentPreset> {
    const agentKey = requiredScope(agentCtx)
    const preset = await this.presets.resolve(id)
    const standing = await this.ensureStanding(preset, placement)
    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    this.placements.set(agentKey, placement)
    return preset
  }

  composeFrom(agentCtx: Context, parentCtx: Context): string | undefined {
    const agentKey = requiredScope(agentCtx)
    const parentKey = requiredScope(parentCtx)
    const standing = standingMountFor(parentCtx)
    if (standing === undefined) return undefined
    const placement = this.placements.get(parentKey)
    if (placement === undefined) throw new Error('placement-prototype: parent has no placement')
    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    this.placements.set(agentKey, placement)
    return standing.presetId
  }

  async recompose(agentCtx: Context, id: string): Promise<AgentPreset> {
    const agentKey = requiredScope(agentCtx)
    const placement = this.placements.get(agentKey)
    if (placement === undefined) throw new Error('placement-prototype: agent has no placement')
    const preset = await this.presets.resolve(id)
    const standing = await this.ensureStanding(preset, placement)
    const binding = this.bindings.get(agentKey)
    if (binding === undefined) {
      this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    } else {
      binding.rebind(standing.key)
    }
    return preset
  }

  async standingKeyFor(id: string, placement: PresetPlacement): Promise<ScopeKey> {
    return (await this.ensureStanding(await this.presets.resolve(id), placement)).key
  }

  private async ensureStanding(preset: AgentPreset, placement: PresetPlacement): Promise<PrototypeStanding> {
    let bucket = this.standing.get(placement.parent)
    if (bucket === undefined) {
      bucket = new Map()
      this.standing.set(placement.parent, bucket)
    }
    const existing = bucket.get(preset.id)
    if (existing !== undefined) return await existing

    const created = (async (): Promise<PrototypeStanding> => {
      const key: ScopeKey = { agentPreset: preset.id }
      const scope = createScope(placement.ctx, key, { parent: placement.parent })
      try {
        await mountPreset(scope.ctx, preset)
        return { presetId: preset.id, key, scope }
      } catch (error) {
        if (bucket?.get(preset.id) === created) bucket.delete(preset.id)
        await scope.dispose()
        throw error
      }
    })()
    bucket.set(preset.id, created)
    return await created
  }
}

function requiredScope(ctx: Context): ScopeKey {
  const key = scopeOf(ctx)
  if (key === undefined) throw new Error('placement-prototype: unscoped context')
  return key
}
