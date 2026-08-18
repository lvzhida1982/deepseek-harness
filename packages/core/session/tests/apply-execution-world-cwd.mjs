import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../src/index.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
}

replaceExact(
  "import { isAbsolute } from 'node:path'\n",
  "import { posix, win32 } from 'node:path'\n",
  'node:path import',
)

replaceExact(
`  if (record.cwd !== undefined) {
    if (typeof record.cwd !== 'string') throw new Error('session header cwd must be a string')
    if (!isAbsolute(record.cwd)) {
      throw new Error(\`session header cwd must be an absolute path, got "\${record.cwd}"\`)
    }
  }
`,
`  if (record.cwd !== undefined) {
    if (typeof record.cwd !== 'string') throw new Error('session header cwd must be a string')
    // Session cwd belongs to the execution world, whose platform may differ
    // from the Harness host. Validate against both process-path grammars rather
    // than interpreting the path through the host's active node:path dialect.
    if (!posix.isAbsolute(record.cwd) && !win32.isAbsolute(record.cwd)) {
      throw new Error(\`session header cwd must be an absolute path, got "\${record.cwd}"\`)
    }
  }
`,
  'cwd absolute-path validation',
)

await writeFile(path, source)
console.log('已生成 execution-world cwd 实验实现')
