import { rm, writeFile } from 'node:fs/promises'

const cleanWorkflow = `name: Execution World Tool FS Paths Experiment

on:
  push:
    branches:
      - experiment/execution-world-tool-fs-paths
  pull_request:
    branches:
      - experiment/execution-world-agent-instructions
  workflow_dispatch:

permissions:
  contents: read

jobs:
  tool-fs-paths:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with:
          version: 11.7.0
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: 运行 tool-fs 跨执行世界 cwd 聚焦测试
        run: pnpm exec vitest run packages/fs/tool-fs/tests/execution-world-paths.spec.ts
      - name: 运行 tool-fs 完整测试
        run: pnpm exec vitest run packages/fs/tool-fs/tests
      - name: 运行 Host 类型与构建检查
        run: pnpm run build:lib:host
`

await writeFile('.github/workflows/experiment-execution-world-tool-fs-paths.yml', cleanWorkflow)
for (const path of [
  'packages/fs/tool-fs/tests/apply-execution-world-cwd-semantics.mjs',
  'packages/fs/tool-fs/tests/apply-execution-world-cwd.mjs',
  'packages/fs/tool-fs/tests/fix-execution-world-path-test.mjs',
  'packages/fs/tool-fs/tests/finalize-execution-world-cwd-semantics.mjs',
]) {
  await rm(path, { force: true })
}
console.log('已移除 tool-fs 实验生成脚手架并切换到只读清洁验证')
