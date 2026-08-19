import { rm, writeFile } from 'node:fs/promises'

const cleanWorkflow = `name: Agent Preset Placement Provider Experiment

on:
  push:
    branches:
      - experiment/agent-preset-placement-provider
  pull_request:
    branches:
      - experiment/execution-world-placement
  workflow_dispatch:

permissions:
  contents: read

jobs:
  placement-provider:
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
      - name: 运行 Placement Provider 聚焦测试
        run: pnpm exec vitest run packages/preset/agent-presets/tests/placement-provider.spec.ts packages/preset/agent-presets/tests/placement.spec.ts
      - name: 运行 agent-presets 完整测试
        run: pnpm exec vitest run packages/preset/agent-presets/tests
      - name: 运行 Host 类型与构建检查
        run: pnpm run build:lib:host
`

await writeFile('.github/workflows/experiment-agent-preset-placement-provider.yml', cleanWorkflow)
for (const path of [
  'packages/preset/agent-presets/tests/apply-placement-provider.mjs',
  'packages/preset/agent-presets/tests/finalize-placement-provider.mjs',
]) {
  await rm(path, { force: true })
}
console.log('已移除 Placement Provider 生成脚手架并切换到只读清洁验证')
