import path from "node:path";

/**
 * Resolve a repo-relative path, refusing any path that escapes the repository
 * root (parent-directory traversal, absolute paths, or the root itself).
 */
export function toRepoPath(repoRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to access an absolute repository path: ${relativePath}`);
  }

  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to access a path outside the repository: ${relativePath}`);
  }

  return resolved;
}
