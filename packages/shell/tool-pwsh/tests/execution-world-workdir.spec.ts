import { win32 } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolPwsh from '@deepseek-ai/dsh-tool-pwsh'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'

class RecordingShellExecutor extends ShellExecutor {
  lastSpec: ShellExecSpec | undefined

  resolve(request: ShellExecRequest): ShellExecSpec {
    const spec: ShellExecSpec = {
      command: request.command,
      workdir: request.workdir ?? String.raw`D:\default`,
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

type FixtureTarget = { targetKey: string; displayPath: string }

function installWindowsExecutionWorldFs(ctx: Context): void {
  const fs = {
    async resolve(candidate: string, opts: { cwd?: string } = {}): Promise<FixtureTarget> {
      const processPath = win32.isAbsolute(candidate)
        ? win32.normalize(candidate)
        : win32.resolve(opts.cwd ?? String.raw`D:\default`, candidate)
      return { targetKey: processPath, displayPath: processPath }
    },
    processPath(target: FixtureTarget): string {
      return target.displayPath
    },
  }
  ctx.reflect.provide('fs', fs)
}

async function harness(): Promise<{ ctx: Context; shell: RecordingShellExecutor }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(RecordingShellExecutor)
  await ctx.plugin(ShellEnv)
  installWindowsExecutionWorldFs(ctx)
  await ctx.plugin(ToolPwsh, { enableRunInBackground: false })
  return { ctx, shell: ctx.shell as RecordingShellExecutor }
}

function fakeAgent(ctx: Context, cwd: string): Agent {
  const id = SessionId('pwsh-windows-world')
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

describe('pwsh execution-world workdir', () => {
  it('resolves a relative workdir with the Windows execution-world filesystem', async () => {
    const { ctx, shell } = await harness()
    const agent = fakeAgent(ctx, String.raw`D:\Project`)

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('pwsh-windows-relative-workdir'),
      name: 'pwsh',
      arguments: {
        command: 'Write-Output ok',
        description: 'Run command in child directory',
        workdir: 'src',
      },
      agent,
    })

    expect(result.isError).toBe(false)
    expect(shell.lastSpec?.workdir).toBe(String.raw`D:\Project\src`)
  })
})
