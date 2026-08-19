import { Context, type Fiber } from '@deepseek-ai/cordis'
import Lsp, {
  LspProviderId,
  type LspProvider,
  type LspQueryResult,
} from '@deepseek-ai/dsh-lsp'
import { describe, expect, it } from 'vitest'

interface LspWorld {
  readonly ctx: Context
  readonly fiber: Fiber
  readonly lsp: Lsp
}

function provider(label: string): LspProvider {
  return {
    id: LspProviderId('typescript'),
    extensionToLanguage: { '.ts': 'typescript' },
    query(request): Promise<LspQueryResult> {
      return Promise.resolve({
        kind: 'hover',
        hover: { contents: `${label}:${request.filePath}` },
      })
    },
  }
}

async function world(root: Context, label: string): Promise<LspWorld> {
  // Each runtime ExecutionWorld owns an independent ctx.lsp service instance.
  // A reconnect intentionally gets a fresh isolation label rather than reviving
  // an already-disposed runtime world.
  const ctx = root.isolate('lsp')
  const fiber = await ctx.plugin(Lsp)
  const lsp = ctx.lsp as Lsp
  lsp.registerProvider(provider(label))
  return { ctx, fiber, lsp }
}

function query(filePath: string) {
  return {
    operation: 'hover' as const,
    filePath,
    position: { line: 0, character: 0 },
    workspaceRoot: filePath.startsWith('D:') ? 'D:\\Project' : '/home/a/project',
  }
}

describe('LSP execution-world lifecycle', () => {
  it('isolates identical provider ids and extension routes between two worlds', async () => {
    const root = new Context()
    const worldA = await world(root, 'A')
    const worldB = await world(root, 'B')

    expect(worldA.lsp).not.toBe(worldB.lsp)

    await expect(worldA.lsp.query(query('/home/a/project/src/main.ts'))).resolves.toEqual({
      kind: 'hover',
      hover: { contents: 'A:/home/a/project/src/main.ts' },
    })
    await expect(worldB.lsp.query(query('D:\\Project\\src\\main.ts'))).resolves.toEqual({
      kind: 'hover',
      hover: { contents: 'B:D:\\Project\\src\\main.ts' },
    })
  })

  it('disposing one world removes only its resolvable LSP capability and does not affect another world', async () => {
    const root = new Context()
    const worldA = await world(root, 'A')
    const worldB = await world(root, 'B')

    await worldB.fiber.dispose()

    // Cordis lifecycle is defined by service resolution. A raw JS reference
    // retained by test code is outside that contract and is intentionally not
    // used to model a live ExecutionWorld capability after disposal.
    expect(worldB.ctx.get('lsp')).toBeUndefined()

    await expect(worldA.lsp.query(query('/home/a/project/src/main.ts'))).resolves.toEqual({
      kind: 'hover',
      hover: { contents: 'A:/home/a/project/src/main.ts' },
    })
  })

  it('reacquires a fresh LSP world after reconnect without reusing the disposed service', async () => {
    const root = new Context()
    const worldA = await world(root, 'A')
    const oldWorldB = await world(root, 'B-old')

    await oldWorldB.fiber.dispose()
    expect(oldWorldB.ctx.get('lsp')).toBeUndefined()

    const newWorldB = await world(root, 'B-new')

    expect(newWorldB.lsp).not.toBe(oldWorldB.lsp)
    await expect(newWorldB.lsp.query(query('D:\\Project\\new.ts'))).resolves.toEqual({
      kind: 'hover',
      hover: { contents: 'B-new:D:\\Project\\new.ts' },
    })

    await expect(worldA.lsp.query(query('/home/a/project/src/main.ts'))).resolves.toEqual({
      kind: 'hover',
      hover: { contents: 'A:/home/a/project/src/main.ts' },
    })
  })
})
