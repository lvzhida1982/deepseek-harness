import { readFile, writeFile } from 'node:fs/promises'

async function replace(relative, before, after, label) {
  const url = new URL(`../../../../${relative}`, import.meta.url)
  let source = await readFile(url, 'utf8')
  if (!source.includes(before)) throw new Error(`${relative}: 未找到预期源码片段：${label}`)
  source = source.replace(before, after)
  await writeFile(url, source)
}

await replace(
  'packages/e2b/fs-e2b/src/index.ts',
  `  private readonly locks = new Map<string, Promise<unknown>>()\n\n  override async resolve`,
  `  private readonly locks = new Map<string, Promise<unknown>>()\n\n  /** E2B sandboxes are POSIX regardless of the Harness host platform. */\n  override get path() {\n    return posix\n  }\n\n  override async resolve`,
  '声明 E2B 固定 POSIX 路径语义',
)

await replace(
  'packages/context/agent-instructions/tests/execution-world-paths.spec.ts',
  `  get path() {\n    return win32\n  }`,
  `  override get path() {\n    return win32\n  }`,
  '生成后补充 override',
)

console.log('已补齐 E2B POSIX 路径语义与测试 override')
