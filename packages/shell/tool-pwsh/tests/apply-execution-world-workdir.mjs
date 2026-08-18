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
`function resolveWorkdir(modelWorkdir: string | undefined, exec: { agent?: Agent }): string | undefined {
  const headerCwd = exec.agent?.session.header.cwd
  if (modelWorkdir === undefined) return headerCwd
  if (headerCwd !== undefined && !isAbsolute(modelWorkdir)) {
    return resolvePath(headerCwd, modelWorkdir)
  }
  return modelWorkdir
}
`,
`async function resolveWorkdir(
  ctx: Context,
  modelWorkdir: string | undefined,
  exec: Pick<ToolExecution, 'agent' | 'signal'>,
): Promise<string | undefined> {
  const headerCwd = exec.agent?.session.header.cwd
  const fs = ctx.get('fs')
  if (fs !== undefined) {
    const requested = modelWorkdir ?? headerCwd
    if (requested === undefined) return undefined
    const target = await fs.resolve(requested, {
      ...modelWorkdir !== undefined && headerCwd !== undefined ? { cwd: headerCwd } : {},
      signal: exec.signal,
    })
    return fs.processPath(target)
  }

  // Preserve the historical Shell-only composition when no filesystem seam is
  // mounted. In that deployment the Shell necessarily shares the Harness host
  // path grammar, so node:path remains the correct fallback.
  if (modelWorkdir === undefined) return headerCwd
  if (headerCwd !== undefined && !isAbsolute(modelWorkdir)) {
    return resolvePath(headerCwd, modelWorkdir)
  }
  return modelWorkdir
}
`,
'替换 workdir 解析函数',
)

replaceExact(
`      const workdir = resolveWorkdir(args.workdir, exec)
`,
`      const workdir = await resolveWorkdir(ctx, args.workdir, exec)
`,
'异步解析 workdir',
)

await writeFile(path, source)
console.log('已生成 PowerShell execution-world workdir 实验实现')
