import { readFile, writeFile } from 'node:fs/promises'

async function rewrite(relative, edits) {
  const url = new URL(`../../../../${relative}`, import.meta.url)
  let source = await readFile(url, 'utf8')
  for (const [before, after, label] of edits) {
    if (!source.includes(before)) throw new Error(`${relative}: 未找到预期源码片段：${label}`)
    source = source.replace(before, after)
  }
  await writeFile(url, source)
}

await rewrite('packages/fs/fs/src/index.ts', [
  [
    "import { Context, Service } from '@deepseek-ai/cordis'\n",
    "import * as hostPath from 'node:path'\nimport { Context, Service } from '@deepseek-ai/cordis'\n",
    '引入 Host 默认路径语法',
  ],
  [
    '/**\n * Abstract filesystem provider. Targets must preserve identity across aliases;\n',
    `/** Pure lexical path operations belonging to one filesystem execution world. */\nexport interface FsPathSemantics {\n  readonly sep: string\n  resolve(...paths: string[]): string\n  join(...paths: string[]): string\n  dirname(path: string): string\n  basename(path: string): string\n  relative(from: string, to: string): string\n  isAbsolute(path: string): boolean\n}\n\n/**\n * Abstract filesystem provider. Targets must preserve identity across aliases;\n`,
    '声明执行世界路径语义',
  ],
  [
    "  constructor(ctx: Context) {\n    super(ctx, 'fs')\n  }\n\n  /**\n   * The sandbox mode this backend enforces on mutations BY DEFAULT, or\n",
    `  constructor(ctx: Context) {\n    super(ctx, 'fs')\n  }\n\n  /**\n   * Pure lexical path grammar for this provider's execution world. Local\n   * providers inherit the Harness host grammar; remote/cross-platform\n   * providers override it without exposing Device or transport concepts.\n   */\n  get path(): FsPathSemantics {\n    return hostPath\n  }\n\n  /**\n   * The sandbox mode this backend enforces on mutations BY DEFAULT, or\n`,
    '增加默认路径语义 getter',
  ],
])

await rewrite('packages/context/agent-instructions/src/files.ts', [
  [
    "import { dirname, isAbsolute, join, relative, resolve } from 'node:path'\nimport type { FileSystem, FsInfo, FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'\n",
    "import * as hostPath from 'node:path'\nimport type { FileSystem, FsInfo, FsPathSemantics, FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'\n",
    '改用可选执行世界路径语义',
  ],
  [
    "function signalOptions(signal?: AbortSignal): { signal: AbortSignal } | undefined {\n  return signal === undefined ? undefined : { signal }\n}\n",
    "function signalOptions(signal?: AbortSignal): { signal: AbortSignal } | undefined {\n  return signal === undefined ? undefined : { signal }\n}\n\nfunction pathSemantics(fileSystem?: FileSystem): FsPathSemantics {\n  return fileSystem?.path ?? hostPath\n}\n",
    '增加路径语义选择器',
  ],
  [
    `): Promise<string> {\n  let current = resolve(cwd)\n  for (;;) {\n    for (const marker of markers) {\n      if (await existsAsMarker(join(current, marker), fileSystem, signal)) return current\n    }\n    const parent = dirname(current)\n    if (parent === current) return resolve(cwd)\n    current = parent\n  }\n}\n`,
    `): Promise<string> {\n  const paths = pathSemantics(fileSystem)\n  let current = paths.resolve(cwd)\n  for (;;) {\n    for (const marker of markers) {\n      if (await existsAsMarker(paths.join(current, marker), fileSystem, signal)) return current\n    }\n    const parent = paths.dirname(current)\n    if (parent === current) return paths.resolve(cwd)\n    current = parent\n  }\n}\n`,
    '项目根发现使用 provider 路径语法',
  ],
  [
    `export function ancestorChain(root: string, cwd: string): string[] {\n  const chain: string[] = []\n  let current = resolve(cwd)\n  const resolvedRoot = resolve(root)\n  while (current !== resolvedRoot) {\n    chain.push(current)\n    const parent = dirname(current)\n    /* v8 ignore next -- discovery always supplies cwd or an ancestor root. */\n    if (parent === current) break\n    current = parent\n  }\n  chain.push(resolvedRoot)\n  return chain.reverse()\n}\n`,
    `export function ancestorChain(\n  root: string,\n  cwd: string,\n  paths: FsPathSemantics = hostPath,\n): string[] {\n  const chain: string[] = []\n  let current = paths.resolve(cwd)\n  const resolvedRoot = paths.resolve(root)\n  while (current !== resolvedRoot) {\n    chain.push(current)\n    const parent = paths.dirname(current)\n    /* v8 ignore next -- discovery always supplies cwd or an ancestor root. */\n    if (parent === current) break\n    current = parent\n  }\n  chain.push(resolvedRoot)\n  return chain.reverse()\n}\n`,
    '祖先链接受执行世界路径语义',
  ],
  [
    `export function descendantDirsBetween(root: string, touchedPath: string): string[] {\n  const resolvedRoot = resolve(root)\n  const targetPath = isAbsolute(touchedPath) ? resolve(touchedPath) : resolve(resolvedRoot, touchedPath)\n  const targetDir = dirname(targetPath)\n  const rel = relative(resolvedRoot, targetDir)\n  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return []\n  return ancestorChain(resolvedRoot, targetDir).slice(1)\n}\n`,
    `export function descendantDirsBetween(\n  root: string,\n  touchedPath: string,\n  paths: FsPathSemantics = hostPath,\n): string[] {\n  const resolvedRoot = paths.resolve(root)\n  const targetPath = paths.isAbsolute(touchedPath) ? paths.resolve(touchedPath) : paths.resolve(resolvedRoot, touchedPath)\n  const targetDir = paths.dirname(targetPath)\n  const rel = paths.relative(resolvedRoot, targetDir)\n  if (rel.length === 0 || rel.startsWith('..') || paths.isAbsolute(rel)) return []\n  return ancestorChain(resolvedRoot, targetDir, paths).slice(1)\n}\n`,
    '触达路径使用执行世界路径语义',
  ],
  [
    `export function relativeDisplay(root: string, path: string): string {\n  return relative(root, path)\n}\n`,
    `export function relativeDisplay(\n  root: string,\n  path: string,\n  paths: FsPathSemantics = hostPath,\n): string {\n  return paths.relative(root, path)\n}\n`,
    '相对显示路径接受执行世界路径语义',
  ],
  [
    `): Promise<DiscoveredInstructionFile[]> {\n  const found: DiscoveredInstructionFile[] = []\n  for (const candidate of instructionFileCandidates) {\n    const path = join(dir, candidate)\n    const probe = await statFile(path, fileSystem, signal)\n`,
    `): Promise<DiscoveredInstructionFile[]> {\n  const found: DiscoveredInstructionFile[] = []\n  const paths = pathSemantics(fileSystem)\n  for (const candidate of instructionFileCandidates) {\n    const path = paths.join(dir, candidate)\n    const probe = await statFile(path, fileSystem, signal)\n`,
    '候选文件拼接使用执行世界路径语义',
  ],
  [
    `        found.push({ absolutePath: path, displayPath: relativeDisplay(root, path), ...probe.info })\n`,
    `        found.push({ absolutePath: path, displayPath: relativeDisplay(root, path, paths), ...probe.info })\n`,
    '候选显示路径使用执行世界路径语义',
  ],
  [
    `  const config = resolveDiscoveryConfig(options)\n  const files: DiscoveredInstructionFile[] = []\n`,
    `  const config = resolveDiscoveryConfig(options)\n  const paths = pathSemantics(fileSystem)\n  const files: DiscoveredInstructionFile[] = []\n`,
    '发现阶段取得路径语义',
  ],
  [
    `  const userGlobal = join(config.dshHome, USER_GLOBAL_FILE)\n`,
    `  const userGlobal = paths.join(config.dshHome, USER_GLOBAL_FILE)\n`,
    '用户全局候选拼接使用同一 provider 语义',
  ],
  [
    `  const cwd = resolve(options.cwd)\n`,
    `  const cwd = paths.resolve(options.cwd)\n`,
    'cwd 使用执行世界路径语义规范化',
  ],
  [
    `  for (const dir of ancestorChain(projectRoot, cwd)) {\n`,
    `  for (const dir of ancestorChain(projectRoot, cwd, paths)) {\n`,
    '发现祖先链使用执行世界路径语义',
  ],
])

console.log('已生成 FileSystem execution-world lexical path semantics 原型')
