import { readFile, writeFile } from 'node:fs/promises'

const src = new URL('../src/', import.meta.url)
const tests = new URL('./', import.meta.url)

await writeFile(new URL('session-cwd.ts', src), `/**
 * Derive filesystem resolution options from the calling agent's per-session
 * workspace without letting the Harness Host interpret another execution
 * world's path spelling.
 * @module @deepseek-ai/dsh-tool-fs/session-cwd
 */

import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

const PARENT_PATH_SEGMENT = /(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)/

/**
 * Resolve the session cwd to the physical process path only when parent
 * traversal makes symlink identity observable. The canonicalization belongs to
 * the mounted filesystem execution world: resolve() follows its aliases and
 * processPath() returns the path a same-world process can open.
 */
export async function sessionCwd(
  fileSystem: FileSystem,
  exec: ToolExecution,
  requestedPath: string,
): Promise<string | undefined> {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  const target = await fileSystem.resolve(cwd, { signal: exec.signal })
  return fileSystem.processPath(target)
}

/** Resolution options shared by all model-facing filesystem tools. */
export async function sessionResolveOptions(
  fileSystem: FileSystem,
  exec: ToolExecution,
  requestedPath: string,
  policyWorkspaceRoot?: string,
): Promise<{ cwd?: string; signal?: AbortSignal }> {
  // Preserve the existing policy-root precedence. A resolved sandbox policy
  // already owns its workspace identity; only the raw Session cwd needs the
  // parent-traversal canonicalization above.
  const cwd = policyWorkspaceRoot ?? await sessionCwd(fileSystem, exec, requestedPath)
  return {
    ...cwd !== undefined ? { cwd } : {},
    signal: exec.signal,
  }
}
`)

async function replaceExact(relative, before, after, label) {
  const path = new URL(relative, src)
  let source = await readFile(path, 'utf8')
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
  await writeFile(path, source)
}

await replaceExact(
  'read-target.ts',
  `  const target = await ctx.fs.resolve(requestedPath, sessionResolveOptions(exec, requestedPath))\n`,
  `  const target = await ctx.fs.resolve(requestedPath, await sessionResolveOptions(ctx.fs, exec, requestedPath))\n`,
  'read target resolution',
)

await replaceExact(
  'write.ts',
  `      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, input.filePath, sandboxPolicy?.workspaceRoot))\n`,
  `      const target = await ctx.fs.resolve(input.filePath, await sessionResolveOptions(ctx.fs, exec, input.filePath, sandboxPolicy?.workspaceRoot))\n`,
  'write target resolution',
)

await replaceExact(
  'edit.ts',
  `      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, input.filePath, sandboxPolicy?.workspaceRoot))\n`,
  `      const target = await ctx.fs.resolve(input.filePath, await sessionResolveOptions(ctx.fs, exec, input.filePath, sandboxPolicy?.workspaceRoot))\n`,
  'edit target resolution',
)

const toolsSpecPath = new URL('tools.spec.ts', tests)
let toolsSpec = await readFile(toolsSpecPath, 'utf8')
const oldBlock = `describe('session cwd resolution', () => {
  const execution = (cwd?: string) => cwd === undefined
    ? {}
    : { agent: { session: { header: { cwd } } } }

  it('retains ordinary spelling but resolves the cwd before parent traversal', () => {
    const cwd = process.cwd()
    const throughParent = \`${'${cwd}'}${'${sep}'}..\`
    expect(sessionCwd(execution() as never, 'file.txt')).toBeUndefined()
    expect(sessionCwd(execution(cwd) as never, 'file.txt')).toBe(cwd)
    expect(sessionCwd(execution(throughParent) as never, 'file.txt')).toBe(realpathSync.native(throughParent))

    const root = mkdtempSync(join(tmpdir(), 'dsh-tool-fs-session-cwd-'))
    const physical = join(root, 'physical')
    const link = join(root, 'link')
    try {
      mkdirSync(physical)
      symlinkSync(physical, link, process.platform === 'win32' ? 'junction' : 'dir')
      expect(sessionCwd(execution(link) as never, 'child.txt')).toBe(link)
      expect(sessionCwd(execution(link) as never, \`..${'${sep}'}parent.txt\`)).toBe(realpathSync.native(link))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})`
const newBlock = `describe('session cwd resolution', () => {
  const execution = (cwd?: string) => cwd === undefined
    ? {}
    : { agent: { session: { header: { cwd } } } }
  const physicalFs = {
    async resolve(path: string) {
      const physical = realpathSync.native(path)
      return { targetKey: FsTargetKey(physical), displayPath: path }
    },
    processPath(target: FsTarget) { return String(target.targetKey) },
  } as FileSystem

  it('retains ordinary spelling but resolves the cwd in the filesystem world before parent traversal', async () => {
    const cwd = process.cwd()
    const throughParent = \`${'${cwd}'}${'${sep}'}..\`
    expect(await sessionCwd(physicalFs, execution() as never, 'file.txt')).toBeUndefined()
    expect(await sessionCwd(physicalFs, execution(cwd) as never, 'file.txt')).toBe(cwd)
    expect(await sessionCwd(physicalFs, execution(throughParent) as never, 'file.txt')).toBe(realpathSync.native(throughParent))

    const root = mkdtempSync(join(tmpdir(), 'dsh-tool-fs-session-cwd-'))
    const physical = join(root, 'physical')
    const link = join(root, 'link')
    try {
      mkdirSync(physical)
      symlinkSync(physical, link, process.platform === 'win32' ? 'junction' : 'dir')
      expect(await sessionCwd(physicalFs, execution(link) as never, 'child.txt')).toBe(link)
      expect(await sessionCwd(physicalFs, execution(link) as never, \`..${'${sep}'}parent.txt\`)).toBe(realpathSync.native(link))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})`
if (!toolsSpec.includes(oldBlock)) throw new Error('未找到 tools.spec.ts 的 session cwd 测试块')
toolsSpec = toolsSpec.replace(oldBlock, newBlock)
await writeFile(toolsSpecPath, toolsSpec)

await writeFile(new URL('execution-world-paths.spec.ts', tests), `import { mkdirSync, rmSync } from 'node:fs'
import { resolve, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FsTargetKey, type FileSystem, type FsTarget } from '@deepseek-ai/dsh-fs'
import { sessionCwd } from '../src/session-cwd.ts'

const WINDOWS_CWD = String.raw\`D:\\Project\\packages\\app\`
const WINDOWS_PARENT_REQUEST = String.raw\`..\\shared.txt\`
const execution = (cwd: string) => ({ agent: { session: { header: { cwd } } } })

describe('tool-fs execution-world cwd', () => {
  it('canonicalizes parent traversal in the mounted filesystem world, never the Host filesystem', async () => {
    if (process.platform === 'win32') return
    mkdirSync(WINDOWS_CWD)
    const calls: string[] = []
    const windowsFs = {
      async resolve(path: string) {
        calls.push(path)
        const physical = win32.resolve(path)
        return { targetKey: FsTargetKey(physical), displayPath: physical }
      },
      processPath(target: FsTarget) { return String(target.targetKey) },
    } as FileSystem
    try {
      expect(await sessionCwd(windowsFs, execution(WINDOWS_CWD) as never, WINDOWS_PARENT_REQUEST))
        .toBe(WINDOWS_CWD)
      expect(calls).toEqual([WINDOWS_CWD])
      expect(resolve(WINDOWS_CWD)).not.toBe(WINDOWS_CWD)
    } finally {
      rmSync(WINDOWS_CWD, { recursive: true, force: true })
    }
  })
})
`)

console.log('已生成 tool-fs 同执行世界 cwd canonicalization 实验实现')
