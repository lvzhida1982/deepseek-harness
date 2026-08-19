import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../src/api-proxy.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
}

replaceExact(
`import type { PresetBearingSession } from '@deepseek-ai/dsh-agent-presets'\n`,
`import type { PresetBearingSession, PresetPlacement } from '@deepseek-ai/dsh-agent-presets'\n`,
'导入 PresetPlacement',
)

replaceExact(
`/** Resolved Agent model and project-directory defaults consumed by the API implementation. */
export interface ApiProxyDefaults {
`,
`/** Stable Session identity facts a deployment may use to resolve an execution placement. */
export interface ApiProxySessionContext {
  sessionId: SessionId
  cwd?: string
  parentSessionId?: SessionId
}

/** Resolved Agent model and project-directory defaults consumed by the API implementation. */
export interface ApiProxyDefaults {
`,
'增加会话上下文类型',
)

replaceExact(
`  /** Default project directory for new sessions whose create request carries no cwd. */
  cwd: string
`,
`  /** Default project directory for new sessions whose create request carries no cwd. */
  cwd: string
  /**
   * Prepare a fresh Session's cwd in the deployment-selected execution world.
   * Absent, ApiProxy preserves the historical Host-local mkdir behavior.
   */
  prepareSessionCwd?: (session: ApiProxySessionContext & { cwd: string }) => Promise<void>
  /**
   * Resolve the runtime placement under which this Session's preset generation
   * is mounted. Called for fresh create, resume, cold presentation, and fork.
   * Absent, presets retain their historical Host placement.
   */
  resolveSessionPlacement?: (session: ApiProxySessionContext) => Promise<PresetPlacement | undefined>
`,
'增加 cwd preparation 与 placement resolver',
)

replaceExact(
`  async function composeAgent(presetId: string | undefined): Promise<{
    agentPreset?: string
    setup: (agentCtx: Context) => Promise<void>
  }> {
`,
`  async function composeAgent(
    presetId: string | undefined,
    session: ApiProxySessionContext,
  ): Promise<{
    agentPreset?: string
    setup: (agentCtx: Context) => Promise<void>
  }> {
`,
'让 composeAgent 接收 Session 上下文',
)

replaceExact(
`    const resolvedId = (await presets.resolve(presetId)).id
    return {
      agentPreset: resolvedId,
      setup: async (agentCtx: Context) => {
        installSelection(agentCtx)
        await presets.mount(agentCtx, resolvedId)
      },
    }
`,
`    const resolvedId = (await presets.resolve(presetId)).id
    const placement = await defaults.resolveSessionPlacement?.(session)
    return {
      agentPreset: resolvedId,
      setup: async (agentCtx: Context) => {
        installSelection(agentCtx)
        await presets.mount(agentCtx, resolvedId, placement)
      },
    }
`,
'按 Session 解析 Preset placement',
)

replaceExact(
`    setup: async ({ meta, events }) =>
      (await composeAgent(resolveSessionPreset({ header: meta, events }))).setup,
`,
`    setup: async ({ meta, events }) =>
      (await composeAgent(resolveSessionPreset({ header: meta, events }), {
        sessionId: meta.id,
        ...meta.cwd === undefined ? {} : { cwd: meta.cwd },
        ...meta.parentSession === undefined ? {} : { parentSessionId: meta.parentSession },
      })).setup,
`,
'cold resume 解析 placement',
)

replaceExact(
`      return await presets.standingKeyFor(resolveSessionPreset(session))
`,
`      const placement = await defaults.resolveSessionPlacement?.({
        sessionId,
        ...session.header.cwd === undefined ? {} : { cwd: session.header.cwd },
        ...session.header.parentSession === undefined ? {} : { parentSessionId: session.header.parentSession },
      })
      return await presets.standingKeyFor(resolveSessionPreset(session), placement)
`,
'cold presenter 解析 placement',
)

replaceExact(
`            setup: (await composeAgent(storedPreset)).setup,
`,
`            setup: (await composeAgent(storedPreset, {
              sessionId,
              ...inspected.meta.cwd === undefined ? {} : { cwd: inspected.meta.cwd },
              ...inspected.meta.parentSession === undefined ? {} : { parentSessionId: inspected.meta.parentSession },
            })).setup,
`,
'resume 解析 placement',
)

replaceExact(
`        try {
          await mkdir(cwd, { recursive: true })
        } catch (error: unknown) {
          throw new Error(\`failed to ensure project directory "\${cwd}": \${String(error)}\`, { cause: error })
        }
        const composition = await composeAgent(presetId)
`,
`        try {
          if (defaults.prepareSessionCwd !== undefined) {
            await defaults.prepareSessionCwd({ sessionId, cwd })
          } else {
            await mkdir(cwd, { recursive: true })
          }
        } catch (error: unknown) {
          throw new Error(\`failed to ensure project directory "\${cwd}": \${String(error)}\`, { cause: error })
        }
        const composition = await composeAgent(presetId, { sessionId, cwd })
`,
'fresh create 委托 cwd preparation 并解析 placement',
)

replaceExact(
`        const forkComposition = await composeAgent(resolveSessionPreset(source))
`,
`        const forkComposition = await composeAgent(resolveSessionPreset(source), {
          sessionId: childId,
          ...source.header.cwd === undefined ? {} : { cwd: source.header.cwd },
          parentSessionId: source.id,
        })
`,
'fork 继承父 Session placement 上下文',
)

await writeFile(path, source)
console.log('已生成 ApiProxy Execution World 会话装配策略原型')
