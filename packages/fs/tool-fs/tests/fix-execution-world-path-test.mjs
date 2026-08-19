import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('./execution-world-paths.spec.ts', import.meta.url)
let source = await readFile(path, 'utf8')
source = source.replace(
  /^const WINDOWS_CWD = .*$/m,
  "const WINDOWS_CWD = String.raw`D:\\Project\\packages\\app`",
)
source = source.replace(
  /^const WINDOWS_PARENT_REQUEST = .*$/m,
  "const WINDOWS_PARENT_REQUEST = String.raw`..\\shared.txt`",
)
source = source.replace('    const providerResolves = []\n', '    const providerResolves: string[] = []\n')
source = source.replace('      async resolve(path) {\n', '      async resolve(path: string) {\n')
source = source.replace('      processPath(target) {\n', "      processPath(target: { targetKey: unknown }) {\n")
await writeFile(path, source)
console.log('已修正 Windows 路径测试夹具的转义与类型')
