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
await writeFile(path, source)
console.log('已修正 Windows 路径测试夹具的 String.raw 转义')
