import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('./api-proxy-agent-preset.spec.ts', import.meta.url)
let source = await readFile(path, 'utf8')

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`未找到预期测试片段：${label}`)
  source = source.replace(before, after)
}

replaceExact(
`import { mkdtempSync, realpathSync } from 'node:fs'\n`,
`import { existsSync, mkdtempSync, realpathSync } from 'node:fs'\n`,
'增加 existsSync',
)

replaceExact(
`    mount: (_ctx: Context, id?: string) => Promise.resolve(presetOf(id ?? ids[0] ?? '')),\n`,
`    mount: (_ctx: Context, id?: string, placement?: unknown) => {\n      mountPlacementRequests.push(placement)\n      return Promise.resolve(presetOf(id ?? ids[0] ?? ''))\n    },\n`,
'记录 mount placement',
)

replaceExact(
`    standingKeyFor: (id?: string) => {\n      const wanted = id ?? ids[0] ?? ''\n      standingKeyRequests.push(wanted)\n`,
`    standingKeyFor: (id?: string, placement?: unknown) => {\n      const wanted = id ?? ids[0] ?? ''\n      standingKeyRequests.push(wanted)\n      standingPlacementRequests.push(placement)\n`,
'记录 cold standing placement',
)

replaceExact(
`const standingKeyRequests: string[] = []\n`,
`const standingKeyRequests: string[] = []\nconst mountPlacementRequests: unknown[] = []\nconst standingPlacementRequests: unknown[] = []\n`,
'增加 placement 记录器',
)

source += `\n\ndescribe('session.create execution-world composition strategy', () => {\n  it('delegates fresh cwd preparation and passes the resolved placement to the preset mount', async () => {\n    const placement = { ctx: new Context(), parent: {} as never }\n    const prepared: unknown[] = []\n    const resolved: unknown[] = []\n    mountPlacementRequests.length = 0\n\n    const { api, cwd } = await harness(['standard'], undefined, {\n      defaults: {\n        prepareSessionCwd: async (session: unknown) => { prepared.push(session) },\n        resolveSessionPlacement: async (session: unknown) => {\n          resolved.push(session)\n          return placement\n        },\n      },\n    })\n    const remoteCwd = join(cwd, 'must-not-exist-on-host', 'project')\n    expect(existsSync(remoteCwd)).toBe(false)\n\n    const response = await api.sessions.create(request({\n      sessionId: SessionId('strategy-fresh'),\n      cwd: remoteCwd,\n      agentPreset: 'standard',\n    }))\n\n    expect(response.result.ok).toBe(true)\n    expect(existsSync(remoteCwd)).toBe(false)\n    expect(prepared).toEqual([{ sessionId: 'strategy-fresh', cwd: remoteCwd }])\n    expect(resolved).toEqual([{ sessionId: 'strategy-fresh', cwd: remoteCwd }])\n    expect(mountPlacementRequests.at(-1)).toBe(placement)\n  })\n})\n`

await writeFile(path, source)
console.log('已增加 ApiProxy Execution World fresh create 策略验证')
