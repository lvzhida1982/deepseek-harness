/**
 * Optional deployment policy that selects where a preset standing generation
 * lives. The policy names no product domain: a deployment may place agents by
 * workspace, execution world, tenant, security realm, or another stable
 * runtime boundary.
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { AgentPreset } from './preset.ts'
import type { PresetBearingSession } from './session.ts'

/** Runtime location under which one standing preset generation is composed. */
export interface PresetPlacement {
  /** Cordis context that owns the preset's service ancestry. */
  readonly ctx: Context
  /** dsh-scope parent that owns the preset's registry/event ancestry. */
  readonly parent: ScopeKey
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional deployment policy for selecting a preset's runtime placement. */
    agentPresetPlacement: AgentPresetPlacementProvider
  }
}

/**
 * Deployment-owned placement policy. AgentPresets falls back to its historical
 * host placement when no provider is mounted or when a provider returns
 * `undefined`.
 */
export abstract class AgentPresetPlacementProvider extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agentPresetPlacement')
  }

  /** Resolve placement while an unpublished Agent is inside factory setup. */
  abstract forAgent(
    agentCtx: Context,
    preset: AgentPreset,
  ): PresetPlacement | undefined | Promise<PresetPlacement | undefined>

  /** Resolve placement for a detached/cold Session without resuming an Agent. */
  abstract forSession(
    session: PresetBearingSession,
    preset: AgentPreset,
  ): PresetPlacement | undefined | Promise<PresetPlacement | undefined>
}

export default AgentPresetPlacementProvider
