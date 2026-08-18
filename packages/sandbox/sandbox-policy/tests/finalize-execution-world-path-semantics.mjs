import { rm, writeFile } from 'node:fs/promises'

const cleanWorkflow = `name: Execution World Sandbox Policy Paths Experiment

on:
  push:
    branches:
      - experiment/execution-world-sandbox-policy-paths
  pull_request:
    branches:
      - master
  workflow_dispatch:

permissions:
  contents: read

jobs:
  sandbox-policy-paths:
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
      - name: 运行路径语义与本地安全聚焦测试
        run: pnpm exec vitest run packages/sandbox/sandbox-policy/tests/execution-world-path.spec.ts packages/sandbox/sandbox-local/tests/policy-root-ownership.spec.ts
      - name: 运行 Sandbox Policy 与 Local Sandbox 完整测试
        run: pnpm exec vitest run packages/sandbox/sandbox-policy/tests packages/sandbox/sandbox-local/tests
      - name: 运行受影响的 FS、Shell 与 Terminal 测试
        run: pnpm exec vitest run packages/fs/fs-sandbox/tests packages/shell/bash-sandbox/tests packages/shell/pwsh-sandbox/tests packages/shell/tool-bash/tests packages/shell/tool-pwsh/tests packages/terminal/terminal-bash/tests
      - name: 运行 Host 类型与构建检查
        run: pnpm run build:lib:host
`

await writeFile('.github/workflows/experiment-execution-world-sandbox-policy-paths.yml', cleanWorkflow)
await rm('packages/sandbox/sandbox-policy/tests/apply-execution-world-path-semantics.mjs')
await rm('packages/sandbox/sandbox-policy/tests/finalize-execution-world-path-semantics.mjs')
console.log('已移除实验转换脚手架并恢复只读清洁验证 workflow')
