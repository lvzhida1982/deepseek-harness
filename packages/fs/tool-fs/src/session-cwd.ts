/**
 * Derive filesystem resolution options from the calling agent's per-session
 * workspace without letting the Harness Host interpret another execution
 * world's path spelling.
 * @module @deepseek-ai/dsh-tool-fs/session-cwd
 */

import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/**
 * Resolve the session cwd to the physical process path only when parent
 * traversal makes symlink identity observable. The canonicalization belongs to
 * the mounted filesystem execution world: resolve() follows its aliases and
 * processPath() returns the path a same-world process can open.
 */
export async function sessionCwd(
  fileSystem: Pick<FileSystem, 'resolve' | 'processPath'>,
  exec: ToolExecution,
  requestedPath: string,
): Promise<string | undefined> {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  const target = await fileSystem.resolve(cwd, { signal: exec.signal })
  return fileSystem.processPath(target)
}

/** Resolution options shared by all model-facing filesystem tools. */
export async function sessionResolveOptions(
  fileSystem: Pick<FileSystem, 'resolve' | 'processPath'>,
  exec: ToolExecution,
  requestedPath: string,
  policyWorkspaceRoot?: string,
): Promise<{ cwd?: string; signal?: AbortSignal }> {
  // Preserve the existing policy-root precedence. A resolved sandbox policy
  // already owns its workspace identity; only the raw Session cwd needs the
  // parent-traversal canonicalization above.
  const cwd = policyWorkspaceRoot ?? await sessionCwd(fileSystem, exec, requestedPath)
  return {
    ...cwd !== undefined ? { cwd } : {},
    signal: exec.signal,
  }
}
