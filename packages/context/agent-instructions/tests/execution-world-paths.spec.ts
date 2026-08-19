import { win32 } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FileSystem, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import { loadBaselineInstructions } from '@deepseek-ai/dsh-agent-instructions'

class WindowsExecutionWorldFs extends FileSystem {
  readonly entries = new Map<string, { type: FsInfo['type']; content?: string }>()

  override get path() {
    return win32
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    opts?.signal?.throwIfAborted()
    const absolute = win32.resolve(opts?.cwd ?? 'C:\\', path)
    return {
      targetKey: FsTargetKey(absolute.toLowerCase()),
      displayPath: absolute,
    }
  }

  override processPath(target: FsTarget): string {
    return target.displayPath
  }

  override fileUrl(target: FsTarget): string {
    return `file:///${target.displayPath.replaceAll('\\', '/')}`
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    const parentPath = parent.displayPath.toLowerCase()
    const childPath = child.displayPath.toLowerCase()
    return childPath === parentPath || childPath.startsWith(`${parentPath}\\`)
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    signal?.throwIfAborted()
    const entry = this.entries.get(target.displayPath.toLowerCase())
    if (entry === undefined) return undefined
    return {
      type: entry.type,
      version: FsVersion(`v:${target.displayPath.toLowerCase()}`),
      ...(entry.content === undefined ? {} : { size: Buffer.byteLength(entry.content, 'utf8') }),
    }
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const target = await this.resolve(path, { ...opts, ...signal === undefined ? {} : { signal } })
    return this.stat(target, signal)
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    return this.entries.get(target.displayPath.toLowerCase())?.content ?? ''
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    signal?.throwIfAborted()
    const content = this.entries.get(target.displayPath.toLowerCase())?.content ?? ''
    return (async function* () { yield content })()
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    signal?.throwIfAborted()
    const bytes = Buffer.from(this.entries.get(target.displayPath.toLowerCase())?.content ?? '', 'utf8')
    if (bytes.byteLength > maxBytes) throw new Error('too large')
    return bytes
  }

  override async listDir(_target: FsTarget): Promise<FsDirEntry[]> {
    return []
  }

  override async writeText(_target: FsTarget, content: string, _expected?: FsWriteIntent): Promise<FsWriteOutcome> {
    return { operation: 'update', version: FsVersion('unused'), before: '', after: content }
  }

  override async editText(_target: FsTarget, _edit: FsEditRequest): Promise<FsEditOutcome> {
    return { version: FsVersion('unused'), before: '', after: '' }
  }
}

describe('agent instructions execution-world paths', () => {
  it('discovers root-to-cwd instructions with the filesystem provider path grammar', async () => {
    const ctx = new Context()
    await ctx.plugin(WindowsExecutionWorldFs)
    const fs = ctx.fs as WindowsExecutionWorldFs
    fs.entries.set(String.raw`d:\project\.git`, { type: 'directory' })
    fs.entries.set(String.raw`d:\project\agents.md`, { type: 'file', content: 'root rules' })
    fs.entries.set(String.raw`d:\project\packages\app\agents.md`, { type: 'file', content: 'app rules' })

    const rendered = await loadBaselineInstructions({
      cwd: String.raw`D:\Project\packages\app`,
      dshHome: String.raw`D:\HarnessHome`,
      maxBytes: 64_000,
    }, fs)

    expect(rendered).toBeDefined()
    const text = JSON.stringify(rendered)
    expect(text).toContain('root rules')
    expect(text).toContain('app rules')
  })
})
