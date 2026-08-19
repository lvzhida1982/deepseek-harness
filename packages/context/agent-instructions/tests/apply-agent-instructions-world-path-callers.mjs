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

await rewrite('packages/context/agent-instructions/src/config.ts', [
  [
    "import { relative } from 'node:path'\nimport z from '@deepseek-ai/schemastery'\n",
    "import * as hostPath from 'node:path'\nimport z from '@deepseek-ai/schemastery'\nimport type { FsPathSemantics } from '@deepseek-ai/dsh-fs'\n",
    'baseline identity 引入路径语义',
  ],
  [
    `export function workspaceBaselineIdentity(\n  config: ResolvedConfig,\n  cwd: string,\n  projectRoot: string,\n): string {\n  return JSON.stringify({\n    projectRoot: relative(cwd, projectRoot),\n`,
    `export function workspaceBaselineIdentity(\n  config: ResolvedConfig,\n  cwd: string,\n  projectRoot: string,\n  paths: FsPathSemantics = hostPath,\n): string {\n  return JSON.stringify({\n    projectRoot: paths.relative(cwd, projectRoot),\n`,
    'baseline identity 使用执行世界路径语义',
  ],
])

await rewrite('packages/context/agent-instructions/src/index.ts', [
  [
    `    const identity = workspaceBaselineIdentity(resolved, cwd, projectRoot)\n`,
    `    const identity = workspaceBaselineIdentity(resolved, cwd, projectRoot, fileSystem.path)\n`,
    '插件 baseline identity 传入 provider 路径语义',
  ],
])

await rewrite('packages/context/agent-instructions/src/state.ts', [
  [
    `function relativeScope(projectRoot: string, dir: string): string {\n  const scope = relativeDisplay(projectRoot, dir)\n  return scope.length === 0 ? '.' : scope\n}\n`,
    `function relativeScope(projectRoot: string, dir: string, fileSystem: FileSystem): string {\n  const scope = relativeDisplay(projectRoot, dir, fileSystem.path)\n  return scope.length === 0 ? '.' : scope\n}\n`,
    'relative scope 使用 provider 路径语义',
  ],
  [
    `    addDirScopes(target, relativeScope(projectRoot, dir))\n`,
    `    addDirScopes(target, relativeScope(projectRoot, dir, fileSystem))\n`,
    'scope 调用传入文件系统',
  ],
  [
    `  for (const dir of ancestorChain(projectRoot, cwd)) addProjectScopes(baselineScopes, dir)\n`,
    `  for (const dir of ancestorChain(projectRoot, cwd, fileSystem.path)) addProjectScopes(baselineScopes, dir)\n`,
    'baseline ancestor 使用 provider 路径语义',
  ],
  [
    `    for (const dir of descendantDirsBetween(cwd, touchedPath)) addProjectScopes(scopes, dir)\n`,
    `    for (const dir of descendantDirsBetween(cwd, touchedPath, fileSystem.path)) addProjectScopes(scopes, dir)\n`,
    'touched path 使用 provider 路径语义',
  ],
])

await rewrite('packages/context/agent-instructions/src/render.ts', [
  [
    "import { basename, dirname } from 'node:path'\nimport type { InstructionFile, LoadedInstructionFile } from './files.ts'\n",
    "import type { InstructionFile, LoadedInstructionFile } from './files.ts'\n",
    '移除 Host 路径解析',
  ],
  [
    `/** Directory component that identifies the single user-global instruction scope. */\nexport const USER_GLOBAL_DIRECTORY = 'user-global'\n`,
    `function normalizeLogicalPath(path: string): string {\n  return path.replaceAll('\\\\', '/')\n}\n\nfunction logicalDirname(path: string): string {\n  const normalized = normalizeLogicalPath(path)\n  const index = normalized.lastIndexOf('/')\n  if (index < 0) return '.'\n  if (index === 0) return '/'\n  return normalized.slice(0, index)\n}\n\nfunction logicalBasename(path: string): string {\n  const normalized = normalizeLogicalPath(path)\n  const index = normalized.lastIndexOf('/')\n  return index < 0 ? normalized : normalized.slice(index + 1)\n}\n\n/** Directory component that identifies the single user-global instruction scope. */\nexport const USER_GLOBAL_DIRECTORY = 'user-global'\n`,
    '增加与 Host 无关的逻辑 displayPath 解析',
  ],
  [
    `  return dirname(displayPath)\n`,
    `  return logicalDirname(displayPath)\n`,
    'scope 目录使用逻辑路径解析',
  ],
  [
    `  return candidateScopeKey(scopeForDisplayPath(displayPath), basename(displayPath))\n`,
    `  return candidateScopeKey(scopeForDisplayPath(displayPath), logicalBasename(displayPath))\n`,
    'scope 文件名使用逻辑路径解析',
  ],
])

console.log('已让 agent-instructions 完整调用链使用 execution-world path semantics')
