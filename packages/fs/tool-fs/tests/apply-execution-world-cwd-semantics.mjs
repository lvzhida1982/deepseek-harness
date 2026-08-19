import { readFile, writeFile } from 'node:fs/promises'

async function patch(path, edits) {
  let source = await readFile(path, 'utf8')
  for (const { before, after, label } of edits) {
    if (source.includes(after)) continue
    if (!source.includes(before)) throw new Error(`${path}: 未找到预期源码片段：${label}`)
    source = source.replace(before, after)
  }
  await writeFile(path, source)
}

await patch('packages/fs/tool-fs/src/session-cwd.ts', [
  {
    label: '引入 FileSystem 类型',
    before: "import type { ToolExecution } from '@deepseek-ai/dsh-tools'\n",
    after: "import type { FileSystem } from '@deepseek-ai/dsh-fs'\nimport type { ToolExecution } from '@deepseek-ai/dsh-tools'\n",
  },
  {
    label: '把 cwd canonicalization 下沉到当前 FileSystem provider',
    before: `export function sessionResolveOptions(\n  exec: ToolExecution,\n  requestedPath: string,\n  policyWorkspaceRoot?: string,\n): { cwd?: string; signal?: AbortSignal } {\n  const cwd = policyWorkspaceRoot ?? sessionCwd(exec, requestedPath)\n  return {\n    ...cwd !== undefined ? { cwd } : {},\n    signal: exec.signal,\n  }\n}\n`,
    after: `export async function sessionResolveOptions(\n  fs: Pick<FileSystem, 'resolve' | 'processPath'>,\n  exec: ToolExecution,\n  requestedPath: string,\n  policyWorkspaceRoot?: string,\n): Promise<{ cwd?: string; signal?: AbortSignal }> {\n  const sessionWorkspace = exec.agent?.session.header.cwd\n  let cwd = policyWorkspaceRoot ?? sessionWorkspace\n\n  // Parent traversal makes a symlinked cwd's physical identity observable.\n  // Canonicalize that cwd through the SAME filesystem provider that will resolve\n  // the requested path; never ask the Harness Host filesystem to interpret an\n  // Execution World path. Policy roots keep their existing ownership semantics.\n  if (policyWorkspaceRoot === undefined\n    && sessionWorkspace !== undefined\n    && (PARENT_PATH_SEGMENT.test(sessionWorkspace) || PARENT_PATH_SEGMENT.test(requestedPath))) {\n    const workspaceTarget = await fs.resolve(sessionWorkspace, { signal: exec.signal })\n    cwd = fs.processPath(workspaceTarget)\n  }\n\n  return {\n    ...cwd !== undefined ? { cwd } : {},\n    signal: exec.signal,\n  }\n}\n`,
  },
])

await patch('packages/fs/tool-fs/src/read-target.ts', [{
  label: 'read 使用 provider-aware session resolve options',
  before: '  const target = await ctx.fs.resolve(requestedPath, sessionResolveOptions(exec, requestedPath))\n',
  after: '  const target = await ctx.fs.resolve(requestedPath, await sessionResolveOptions(ctx.fs, exec, requestedPath))\n',
}])

await patch('packages/fs/tool-fs/src/write.ts', [{
  label: 'write 使用 provider-aware session resolve options',
  before: '      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, input.filePath, sandboxPolicy?.workspaceRoot))\n',
  after: '      const target = await ctx.fs.resolve(input.filePath, await sessionResolveOptions(ctx.fs, exec, input.filePath, sandboxPolicy?.workspaceRoot))\n',
}])

await patch('packages/fs/tool-fs/src/edit.ts', [{
  label: 'edit 使用 provider-aware session resolve options',
  before: '      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, input.filePath, sandboxPolicy?.workspaceRoot))\n',
  after: '      const target = await ctx.fs.resolve(input.filePath, await sessionResolveOptions(ctx.fs, exec, input.filePath, sandboxPolicy?.workspaceRoot))\n',
}])

await patch('packages/fs/tool-fs/tests/execution-world-paths.spec.ts', [
  {
    label: '测试 provider-aware helper',
    before: "import { sessionCwd } from '../src/session-cwd.ts'\n",
    after: "import { sessionResolveOptions } from '../src/session-cwd.ts'\n",
  },
  {
    label: '红测试改为验证 same-world provider canonicalization',
    before: `  it('does not let a Host path with the same spelling rewrite a Windows execution-world cwd', () => {\n    if (process.platform === 'win32') return\n\n    // On POSIX this is one perfectly legal directory name containing ':' and '\\\\'.\n    // Its existence makes the current Host realpath branch deterministic instead\n    // of merely "usually harmless because the foreign path does not exist".\n    mkdirSync(WINDOWS_CWD)\n    try {\n      expect(sessionCwd(execution(WINDOWS_CWD) as never, WINDOWS_PARENT_REQUEST))\n        .toBe(WINDOWS_CWD)\n      expect(resolve(WINDOWS_CWD)).not.toBe(WINDOWS_CWD)\n    } finally {\n      rmSync(WINDOWS_CWD, { recursive: true, force: true })\n    }\n  })\n`,
    after: `  it('does not let a Host path with the same spelling rewrite a Windows execution-world cwd', async () => {\n    if (process.platform === 'win32') return\n\n    // On POSIX this is one perfectly legal directory name containing ':' and '\\\\'.\n    // Its existence makes any accidental Host realpath deterministic instead of\n    // merely "usually harmless because the foreign path does not exist".\n    mkdirSync(WINDOWS_CWD)\n    const providerResolves: string[] = []\n    const sameWorldFs = {\n      async resolve(path: string) {\n        providerResolves.push(path)\n        return { targetKey: path, displayPath: path }\n      },\n      processPath(target: { targetKey: string }) {\n        return String(target.targetKey)\n      },\n    }\n    try {\n      const options = await sessionResolveOptions(\n        sameWorldFs as never,\n        execution(WINDOWS_CWD) as never,\n        WINDOWS_PARENT_REQUEST,\n      )\n      expect(options.cwd).toBe(WINDOWS_CWD)\n      expect(providerResolves).toEqual([WINDOWS_CWD])\n      expect(resolve(WINDOWS_CWD)).not.toBe(WINDOWS_CWD)\n    } finally {\n      rmSync(WINDOWS_CWD, { recursive: true, force: true })\n    }\n  })\n`,
  },
])

console.log('已生成 tool-fs 同执行世界 cwd 解析原型')
