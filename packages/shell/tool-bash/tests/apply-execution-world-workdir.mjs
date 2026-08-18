import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../src/index.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
}

replaceExact(
"import type { Agent } from '@deepseek-ai/dsh-agent'\n",
'',
'移除不再使用的 Agent 类型导入',
)

replaceExact(
`function resolveWorkdir(
  modelWorkdir: string | undefined,
  exec: { agent?: Agent },
  policyWorkspaceRoot?: string,
): string | undefined {
  const headerCwd = exec.agent?.session.header.cwd
  const sessionCwd = policyWorkspaceRoot ?? (headerCwd === undefined ? undefined : canonicalPath(headerCwd))
  if (modelWorkdir === undefined) return sessionCwd
  if (sessionCwd !== undefined && !isAbsolute(modelWorkdir)) {
    return resolvePath(sessionCwd, modelWorkdir)
  }
  return modelWorkdir
}
`,
`async function resolveWorkdir(
  ctx: Context,
  modelWorkdir: string | undefined,
  exec: Pick<ToolExecution, 'agent' | 'signal'>,
  policyWorkspaceRoot?: string,
): Promise<string | undefined> {
  const headerCwd = exec.agent?.session.header.cwd
  const executionWorldCwd = policyWorkspaceRoot ?? headerCwd
  const fs = ctx.get('fs')
  if (fs !== undefined) {
    const requested = modelWorkdir ?? executionWorldCwd
    if (requested === undefined) return undefined
    const target = await fs.resolve(requested, {
      ...modelWorkdir !== undefined && executionWorldCwd !== undefined ? { cwd: executionWorldCwd } : {},
      signal: exec.signal,
    })
    return fs.processPath(target)
  }

  // Preserve the historical Shell-only composition when no filesystem seam is
  // mounted. In that deployment the Shell necessarily shares the Harness host
  // path grammar, so node:path remains the correct fallback.
  const sessionCwd = policyWorkspaceRoot ?? (headerCwd === undefined ? undefined : canonicalPath(headerCwd))
  if (modelWorkdir === undefined) return sessionCwd
  if (sessionCwd !== undefined && !isAbsolute(modelWorkdir)) {
    return resolvePath(sessionCwd, modelWorkdir)
  }
  return modelWorkdir
}
`,
'替换 workdir 解析函数',
)

replaceExact(
`      const workdir = resolveWorkdir(args.workdir, exec, standingPolicy?.workspaceRoot)
`,
`      const workdir = await resolveWorkdir(ctx, args.workdir, exec, standingPolicy?.workspaceRoot)
`,
'异步解析 workdir',
)

await writeFile(path, source)
console.log('已生成 Bash execution-world workdir 实验实现')
