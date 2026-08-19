import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { typertPlugin } from '../src/tsdown-plugin.ts'
import { WorkspaceTypertGenerator } from '../src/workspace.ts'

const fixtureRoot = resolve(import.meta.dirname, 'fixtures/remote-model')
const temporaryRoots: string[] = []

function externalWorkspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-out-of-tree-product-plugin-')))
  temporaryRoots.push(root)
  cpSync(fixtureRoot, root, { recursive: true })
  return root
}

function enableClientHalf(root: string): string {
  const packageRoot = join(root, 'packages/remote')
  const manifestPath = join(packageRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dsh?: unknown
    exports: Record<string, unknown>
  }
  manifest.dsh = { client: { platform: 'web' } }
  manifest.exports['./client'] = './lib/client.js'
  manifest.exports['./package.json'] = './package.json'
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const lib = join(packageRoot, 'lib')
  mkdirSync(lib, { recursive: true })
  writeFileSync(join(lib, 'client.js'), 'export const productClient = true\n')
  return packageRoot
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('out-of-tree product plugin closure', { timeout: 60_000 }, () => {
  it('builds its own Typert Remote artifacts outside the Harness workspace', () => {
    const root = externalWorkspace()
    const packageRoot = enableClientHalf(root)
    const packageLib = join(packageRoot, 'lib')

    // The copied workspace lives under the OS temp directory and owns its own
    // tsconfig.host.json. Generation must not depend on being one of the DSH
    // monorepo packages selected by the root build.
    const generator = new WorkspaceTypertGenerator(root)
    expect(generator.discover(['host'])).toEqual([{
      package: '@fixture/remote',
      root: 'packages/remote',
      faces: ['host'],
    }])
    const [generated] = generator.generate(['@fixture/remote'], ['host'])
    expect(generated).toMatchObject({
      package: '@fixture/remote',
      face: 'host',
      packageRoot: 'packages/remote',
    })
    expect(generated?.remote?.js).toContain("package: '@fixture/remote'")
    expect(generated?.remote?.dts).toContain("'goals/create'")

    // Exercise the public tsdown build helper exactly as a standalone product
    // repository would: generated Host/Remote faces are written beside that
    // package's own build output, not into dsh-api-remotes.
    typertPlugin({ mode: 'workspace', faces: ['host'] }).writeBundle({ dir: packageLib })
    expect(existsSync(join(packageLib, 'typert.host.js'))).toBe(true)
    expect(existsSync(join(packageLib, 'typert.host.d.ts'))).toBe(true)
    expect(existsSync(join(packageLib, 'typert.remote-client.js'))).toBe(true)
    expect(existsSync(join(packageLib, 'typert.remote-client.d.ts'))).toBe(true)

    // Keep the Host-side generator test face-pure. Client-module discovery is
    // exercised by packages/client/modules/tests/node-half.client.spec.ts in
    // the same workflow, which prevents a client-only source import from
    // contaminating tsconfig.host.json while still verifying both public seams.
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dsh?: { client?: { platform?: string } }
      exports: Record<string, unknown>
    }
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
    expect(readFileSync(join(packageLib, 'client.js'), 'utf8')).toContain('productClient')
  })
})
