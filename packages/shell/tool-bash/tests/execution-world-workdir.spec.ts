import { posix, win32 } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolBash from '@deepseek-ai/dsh-tool-bash'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'

class RecordingShellExecutor extends ShellExecutor {
  lastSpec: ShellExecSpec | undefined

  resolve(request: ShellExecRequest): ShellExecSpec {
    const spec: ShellExecSpec = {
      command: request.command,
      workdir: request.workdir ?? '/default',
      timeoutMs: request.timeoutMs ?? 1000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      sandboxPolicy: request.sandboxPolicy,
      ...request.signal === undefined ? {} : { signal: request.signal },
      ...request.dshEnv === undefined ? {} : { dshEnv: request.dshEnv },
    }
    this.lastSpec = spec
    return spec
  }

  run(spec: ShellExecSpec): Promise<ShellRunResult> {
    this.lastSpec = spec
    return Promise.resolve({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: spec.timeoutMs,
      stdout: { text: 'ok', truncated: false },
      stderr: { text: '', truncated: false },
    })
  }

  start(_spec: ShellExecSpec): ShellProcess {
    throw new Error('background execution is not used in this test')
  }
}

type PathFlavor = 'win32' | 'posix'

type FixtureTarget = { targetKey: string; displayPath: string }

function installExecutionWorldFs(ctx: Context, flavor: PathFlavor): void {
  const path = flavor === 'win32' ? win32 : posix
  const fallback = flavor === 'win32' ? String.raw`D:\default` : '/default'
  const fs = {
    async resolve(candidate: string, opts: { cwd?: string } = {}): Promise<FixtureTarget> {
      const processPath = path.isAbsolute(candidate)
        ? path.normalize(candidate)
        : path.resolve(opts.cwd ?? fallback, candidate)
      return { targetKey: processPath, displayPath: processPath }
    },
    processPath(target: FixtureTarget): string {
      return target.displayPath
    },
  }
  ctx.reflect.provide('fs', fs)
}

async function harness(fsFlavor?: PathFlavor): Promise<{ ctx: Context; shell: RecordingShellExecutor }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(RecordingShellExecutor)
  await ctx.plugin(ShellEnv)
  if (fsFlavor !== undefined) installExecutionWorldFs(ctx, fsFlavor)
  await ctx.plugin(ToolBash, { enableRunInBackground: false })
  return { ctx, shell: ctx.shell as RecordingShellExecutor }
}

function fakeAgent(ctx: Context, cwd: string, suffix: string): Agent {
  const id = SessionId(`execution-world-${suffix}`)
  const agent = {
    id,
    ctx: ctx.plugin(() => {}).ctx,
    session: {
      id,
      header: { version: 0, id, createdAt: 0, cwd },
    },
  } as unknown as Agent
  ctx.agents.register(agent)
  return agent
}

async function executeBash(ctx: Context, agent: Agent, workdir?: string) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`workdir-${Math.random()}`),
    name: 'bash',
    arguments: {
      command: 'echo ok',
      description: 'Run command in selected directory',
      ...workdir === undefined ? {} : { workdir },
    },
    agent,
  })
}

describe('bash execution-world workdir', () => {
  it('resolves a relative workdir with the Windows execution-world filesystem', async () => {
    const { ctx, shell } = await harness('win32')
    const agent = fakeAgent(ctx, String.raw`D:\Project`, 'windows-relative')

    const result = await executeBash(ctx, agent, 'src')

    expect(result.isError).toBe(false)
    expect(shell.lastSpec?.workdir).toBe(String.raw`D:\Project\src`)
  })

  it('keeps an absolute Windows workdir in the Windows execution world', async () => {
    const { ctx, shell } = await harness('win32')
    const agent = fakeAgent(ctx, String.raw`D:\Project`, 'windows-absolute')

    const result = await executeBash(ctx, agent, String.raw`E:\Other\src`)

    expect(result.isError).toBe(false)
    expect(shell.lastSpec?.workdir).toBe(String.raw`E:\Other\src`)
  })

  it('resolves a relative workdir with the POSIX execution-world filesystem', async () => {
    const { ctx, shell } = await harness('posix')
    const agent = fakeAgent(ctx, '/workspace/project', 'posix-relative')

    const result = await executeBash(ctx, agent, 'src')

    expect(result.isError).toBe(false)
    expect(shell.lastSpec?.workdir).toBe('/workspace/project/src')
  })

  it('preserves the historical Host-local fallback when no filesystem service is mounted', async () => {
    const { ctx, shell } = await harness()
    const agent = fakeAgent(ctx, '/workspace/project', 'host-fallback')

    const result = await executeBash(ctx, agent, 'src')

    expect(result.isError).toBe(false)
    expect(shell.lastSpec?.workdir).toBe('/workspace/project/src')
  })
})
