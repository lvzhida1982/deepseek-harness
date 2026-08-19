import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../src/api-proxy.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期源码片段：${label}`)
  source = source.replace(before, after)
}

replaceExact(
  "import { mkdir, stat } from 'node:fs/promises'\n",
  "import { stat } from 'node:fs/promises'\n",
  '移除 mkdir 导入',
)

replaceExact(
`        try {
          await mkdir(cwd, { recursive: true })
        } catch (error: unknown) {
          throw new Error(\`failed to ensure project directory "\${cwd}": \${String(error)}\`, { cause: error })
        }
        const composition = await composeAgent(presetId)
`,
`        // Session cwd is an execution-world path. The gateway records the
        // binding but must not interpret or materialize it through the Harness
        // Host filesystem before composition chooses that execution world.
        // Directory creation is an explicit host/world capability, not a
        // side-effect of minting Session identity.
        const composition = await composeAgent(presetId)
`,
  '移除 fresh Session 的 Host mkdir',
)

await writeFile(path, source)
console.log('已生成 ApiProxy execution-world cwd 实验实现')
