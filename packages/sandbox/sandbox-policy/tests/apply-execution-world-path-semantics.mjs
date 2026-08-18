import { readFile, writeFile } from 'node:fs/promises'

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  return source.replace(before, after)
}

const policyPath = new URL('../src/index.ts', import.meta.url)
let policy = await readFile(policyPath, 'utf8')

policy = replaceExact(
  policy,
`function resolveWorkspaceRoot(path: string): string {
  return resolvePath(canonicalPath(path))
}
`,
`function resolveWorkspaceRoot(path: string, canonicalize: boolean): string {
  return canonicalize ? resolvePath(canonicalPath(path)) : path
}
`,
  '让 Policy root canonicalization 可配置',
)

policy = replaceExact(
  policy,
`  workspaceRoot?: string
}
`,
`  workspaceRoot?: string
  /**
   * Canonicalize workspace roots through this Harness host before publishing
   * policy. Disable when the path belongs to another execution world; its
   * enforcing providers own physical identity there. Defaults to true for
   * backward-compatible local deployments.
   */
  canonicalizeWorkspaceRoot?: boolean
}
`,
  '增加 workspace root canonicalization 配置',
)

policy = replaceExact(
  policy,
`    workspaceRoot: z.string(),
  })

  /** The deployment default mode — the fallback beneath a session override. */
`,
`    workspaceRoot: z.string(),
    canonicalizeWorkspaceRoot: z.boolean().default(true),
  })

  /** The deployment default mode — the fallback beneath a session override. */
`,
  '增加 schema 默认值',
)

policy = replaceExact(
  policy,
`  /** The absolute \`workspace-write\` fallback root for calls without a session cwd. */
  readonly workspaceRoot: string
  constructor(ctx: Context, config: Config) {
`,
`  /** The \`workspace-write\` fallback root in the execution world's path namespace. */
  readonly workspaceRoot: string
  private readonly canonicalizeWorkspaceRoot: boolean
  constructor(ctx: Context, config: Config) {
`,
  '保存 canonicalization 策略',
)

policy = replaceExact(
  policy,
`    this.defaultMode = config.mode as SandboxMode
    this.workspaceRoot = resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())
`,
`    this.defaultMode = config.mode as SandboxMode
    this.canonicalizeWorkspaceRoot = config.canonicalizeWorkspaceRoot as boolean
    this.workspaceRoot = resolveWorkspaceRoot(
      config.workspaceRoot ?? process.cwd(),
      this.canonicalizeWorkspaceRoot,
    )
`,
  '按配置解析 fallback root',
)

policy = replaceExact(
  policy,
`      workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot),
`,
`      workspaceRoot: resolveWorkspaceRoot(
        session?.header.cwd ?? this.workspaceRoot,
        this.canonicalizeWorkspaceRoot,
      ),
`,
  '按配置解析 session root',
)

await writeFile(policyPath, policy)

const localPath = new URL('../../sandbox-local/src/index.ts', import.meta.url)
let local = await readFile(localPath, 'utf8')

local = replaceExact(
  local,
`import { join } from 'node:path'
`,
`import { join, resolve as resolvePath } from 'node:path'
`,
  '增加本地路径绝对化导入',
)

local = replaceExact(
  local,
`import { SandboxProvider, SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
`,
`import { canonicalPath, SandboxProvider, SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
`,
  '增加本地 canonicalPath 导入',
)

local = replaceExact(
  local,
`  confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
    if (this.runnerCommand !== undefined) {
      return {
        argv: [...this.runnerCommand, ...bwrapProfileArgs(policy), '--', ...argv],
`,
`  confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
    // This provider owns the local execution world's physical path identity.
    // Never rely on an upstream policy service having canonicalized a path on
    // the same machine: doing it here keeps the safety boundary with the
    // component that actually constructs the kernel-enforced runner argv.
    const localPolicy: SandboxPolicy = {
      ...policy,
      workspaceRoot: resolvePath(canonicalPath(policy.workspaceRoot)),
    }
    if (this.runnerCommand !== undefined) {
      return {
        argv: [...this.runnerCommand, ...bwrapProfileArgs(localPolicy), '--', ...argv],
`,
  '让 local sandbox 接管物理 workspace root',
)

local = replaceExact(
  local,
`    const selected = this.selectRunner(policy.mode)
    const runnerArgv = this.runnerArgv(selected.runner, policy)
`,
`    const selected = this.selectRunner(localPolicy.mode)
    const runnerArgv = this.runnerArgv(selected.runner, localPolicy)
`,
  '让平台 runner 使用本地 canonical policy',
)

await writeFile(localPath, local)
console.log('已生成 Sandbox Policy Execution World 路径语义实验实现')
