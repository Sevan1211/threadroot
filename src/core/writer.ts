import fs from "node:fs/promises";
import path from "node:path";
import { hashContent } from "./hash.js";
import { MANIFEST_PATH, toRepoPath } from "./paths.js";
import { readManifest } from "./config.js";
import type { GeneratedFile, PlannedWrite, ThreadrootManifest, WritePolicy } from "../types.js";

export async function planWrites(repoRoot: string, files: GeneratedFile[]): Promise<PlannedWrite[]> {
  const manifest = await readManifest(repoRoot);

  return Promise.all(
    files
      .filter((file) => file.path !== MANIFEST_PATH)
      .map(async (file) => {
        const absolutePath = toRepoPath(repoRoot, file.path);
        const desiredHash = hashContent(file.content);
        const previousHash = manifest.files[file.path]?.hash;

        try {
          const current = await fs.readFile(absolutePath, "utf8");
          const currentHash = hashContent(current);
          const status =
            currentHash === desiredHash
              ? "unchanged"
              : previousHash && currentHash === previousHash
                ? "stale"
                : "manual-edit";

          return {
            ...file,
            exists: true,
            currentHash,
            previousHash,
            desiredHash,
            status,
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }

          return {
            ...file,
            exists: false,
            previousHash,
            desiredHash,
            status: "create",
          };
        }
      }),
  );
}

export function createManifest(
  previousManifest: ThreadrootManifest,
  files: PlannedWrite[],
  now = new Date(),
): ThreadrootManifest {
  const manifest: ThreadrootManifest = {
    version: 1,
    files: { ...previousManifest.files },
  };

  for (const file of files) {
    manifest.files[file.path] = {
      path: file.path,
      hash: file.desiredHash,
      generated: file.generated,
      updatedAt: now.toISOString(),
    };
  }
  return manifest;
}

export async function applyWrites(
  repoRoot: string,
  files: PlannedWrite[],
  policy: WritePolicy,
): Promise<PlannedWrite[]> {
  const previousManifest = await readManifest(repoRoot);
  const written: PlannedWrite[] = [];

  for (const file of files) {
    if (file.status === "unchanged") {
      written.push(file);
      continue;
    }

    if (file.status === "manual-edit" && policy === "skip") {
      continue;
    }

    const absolutePath = toRepoPath(repoRoot, file.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.content);
    written.push(file);
  }

  const manifest = createManifest(previousManifest, written);
  const manifestPath = toRepoPath(repoRoot, MANIFEST_PATH);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return written;
}
