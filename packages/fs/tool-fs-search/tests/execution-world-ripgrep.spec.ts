import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type {
  SubprocessCollectedOutputs,
  SubprocessHandle,
  SubprocessOutputRead,
  SubprocessOutputReader,
  SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ToolFsSearch from '@deepseek-ai/dsh-tool-fs-search'
import { rgPath } from '@vscode/ripgrep'
import { describe, expect, it } from 'vitest'

class Reader implements SubprocessOutputReader {
  readFrom(_fromByte: number): SubprocessOutputRead {
    return { text: '', nextOffset: 0, lossy: false }
  }
}

class Handle implements SubprocessHandle {
  readonly pid = 1
  readonly stdin = undefined
  readonly stdout = undefined
  readonly stderr = undefined
  readonly collected: SubprocessCollectedOutputs = { stdout: new Reader(), stderr: new Reader() }
  readonly done = Promise.resolve({ exitCode: 1, signal: null })
  terminate(): void {}
  waitForExit(): Promise<boolean> { return Promise.resolve(true) }
}

class WorldSubprocess extends SubprocessRuntime {
  readonly resolves: string[] = []
  readonly spawns: SubprocessSpawnSpec[] = []

  override resolveExecutable(command: string): Promise<string> {
    this.resolves.push(command)
    return Promise.resolve(String.raw`D:\managed\rg.exe`)
  }

  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.spawns.push(spec)
    return new Handle()
  }

  override spawnTerminal(): Promise<never> {
    return Promise.reject(new Error('fs-search never allocates a terminal'))
  }
}

async function setup(ripgrepExecutable?: string) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(WorldSubprocess)
  await ctx.plugin(ToolFsSearch, {
    sampleOverCapGlobResults: false,
    ...ripgrepExecutable === undefined ? {} : { ripgrepExecutable },
  })
  return { ctx, subprocess: ctx.subprocess as WorldSubprocess }
}

async function runGlob(ctx: Context): Promise<void> {
  const result = await ctx.tools.execute({
    callId: CallId('execution-world-rg'),
    name: 'glob',
    arguments: { pattern: '**/*' },
    signal: new AbortController().signal,
    agent: { session: { header: { id: 'session-rg', cwd: String.raw`D:\Project` } } } as never,
  })
  expect(result.isError).toBe(false)
}

describe('fs-search execution-world ripgrep', () => {
  it('resolves an explicit ripgrep executable through the mounted subprocess world', async () => {
    const { ctx, subprocess } = await setup('rg')
    await runGlob(ctx)

    expect(subprocess.resolves).toEqual(['rg'])
    expect(subprocess.spawns).toHaveLength(1)
    expect(subprocess.spawns[0]?.argv[0]).toBe(String.raw`D:\managed\rg.exe`)
    expect(subprocess.spawns[0]?.cwd).toBe(String.raw`D:\Project`)
  })

  it('preserves the packaged Host ripgrep default when no override is configured', async () => {
    const { ctx, subprocess } = await setup()
    await runGlob(ctx)

    expect(subprocess.resolves).toEqual([])
    expect(subprocess.spawns).toHaveLength(1)
    expect(subprocess.spawns[0]?.argv[0]).toBe(rgPath)
  })
})
