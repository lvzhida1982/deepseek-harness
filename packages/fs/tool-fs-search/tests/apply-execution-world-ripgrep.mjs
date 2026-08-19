import { readFile, writeFile } from 'node:fs/promises'

async function transform(path, replacements) {
  let source = await readFile(path, 'utf8')
  for (const [before, after, label] of replacements) {
    if (!source.includes(before)) throw new Error(`${path}: 未找到预期源码片段：${label}`)
    source = source.replace(before, after)
  }
  await writeFile(path, source)
}

await transform('packages/fs/tool-fs-search/src/search-core.ts', [
  [
`  stderrMaxBytes: number,
): Promise<RipgrepRun> {
`,
`  stderrMaxBytes: number,
  ripgrepExecutable?: string,
): Promise<RipgrepRun> {
`,
'runRipgrep 增加 executable override',
  ],
  [
`    handle = ctx.subprocess.spawn({
      argv: [await resolveRgPath(), '--no-config', ...argv],
`,
`    const executable = ripgrepExecutable === undefined
      ? await resolveRgPath()
      : await ctx.subprocess.resolveExecutable(ripgrepExecutable, undefined, exec.signal)
    handle = ctx.subprocess.spawn({
      argv: [executable, '--no-config', ...argv],
`,
'按 execution-world provider 解析可选 executable',
  ],
])

await transform('packages/fs/tool-fs-search/src/glob.ts', [
  [
`  /** Cooperative tool-call budget (ms) attached as \`ToolDefinition.timeoutMs\`. */
  timeoutMs: number
}
`,
`  /** Cooperative tool-call budget (ms) attached as \`ToolDefinition.timeoutMs\`. */
  timeoutMs: number
  /** Optional ripgrep executable resolved by the mounted subprocess provider. */
  ripgrepExecutable?: string
}
`,
'GlobToolCaps 增加 executable',
  ],
  [
`      const run = await runRipgrep(ctx, exec, 'glob', buildGlobCommand(input), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes)
`,
`      const run = await runRipgrep(ctx, exec, 'glob', buildGlobCommand(input), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes, caps.ripgrepExecutable)
`,
'glob 传递 executable',
  ],
])

await transform('packages/fs/tool-fs-search/src/grep.ts', [
  [
`  /** Cooperative tool-call budget (ms) attached as \`ToolDefinition.timeoutMs\`. */
  timeoutMs: number
}
`,
`  /** Cooperative tool-call budget (ms) attached as \`ToolDefinition.timeoutMs\`. */
  timeoutMs: number
  /** Optional ripgrep executable resolved by the mounted subprocess provider. */
  ripgrepExecutable?: string
}
`,
'GrepToolCaps 增加 executable',
  ],
  [
`      const run = await runRipgrep(ctx, exec, 'grep', buildGrepCommand(input), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes)
`,
`      const run = await runRipgrep(ctx, exec, 'grep', buildGrepCommand(input), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes, caps.ripgrepExecutable)
`,
'grep 传递 executable',
  ],
])

await transform('packages/fs/tool-fs-search/src/index.ts', [
  [
`  /**
   * Cooperative tool-call timeout budget (ms) on both tools, enforced by
   * \`@deepseek-ai/dsh-tool-call-timeout-policy\` through \`exec.signal\`.
   */
  timeoutMs?: number
}
`,
`  /**
   * Cooperative tool-call timeout budget (ms) on both tools, enforced by
   * \`@deepseek-ai/dsh-tool-call-timeout-policy\` through \`exec.signal\`.
   */
  timeoutMs?: number
  /**
   * Optional ripgrep command/path resolved inside the mounted subprocess
   * execution world. Omit to preserve the packaged Host binary default.
   */
  ripgrepExecutable?: string
}
`,
'Config 增加 executable',
  ],
  [
`  timeoutMs: z.number().default(SEARCH_TIMEOUT_MS),
})

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Config>
`,
`  timeoutMs: z.number().default(SEARCH_TIMEOUT_MS),
  ripgrepExecutable: z.string(),
})

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Omit<Config, 'ripgrepExecutable'>> & Pick<Config, 'ripgrepExecutable'>
`,
'Config schema 和 resolved 类型',
  ],
  [
`  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  applyGlobTool(ctx, {
`,
`  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  if (resolved.ripgrepExecutable !== undefined && resolved.ripgrepExecutable.trim().length === 0) {
    throw new Error('tool-fs-search: ripgrepExecutable must be non-blank when provided')
  }
  applyGlobTool(ctx, {
`,
'验证 executable 配置',
  ],
  [
`    timeoutMs: resolved.timeoutMs,
  })
  applyGrepTool(ctx, {
`,
`    timeoutMs: resolved.timeoutMs,
    ...resolved.ripgrepExecutable === undefined ? {} : { ripgrepExecutable: resolved.ripgrepExecutable },
  })
  applyGrepTool(ctx, {
`,
'glob caps 传递 executable',
  ],
  [
`    timeoutMs: resolved.timeoutMs,
  })
}
`,
`    timeoutMs: resolved.timeoutMs,
    ...resolved.ripgrepExecutable === undefined ? {} : { ripgrepExecutable: resolved.ripgrepExecutable },
  })
}
`,
'grep caps 传递 executable',
  ],
])

console.log('已生成 fs-search execution-world ripgrep 实验实现')
