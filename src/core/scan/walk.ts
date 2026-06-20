import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { ignoredDirectories } from "./rules.js";

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export async function walkRepo(repoRoot: string, directory = repoRoot): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    // Skip directories we cannot read (permissions, races) instead of aborting the whole scan.
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPosix(path.relative(repoRoot, absolutePath));

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await walkRepo(repoRoot, absolutePath)));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}
