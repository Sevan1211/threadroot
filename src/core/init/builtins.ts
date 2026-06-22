import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectLockPath, projectObjectDir } from "../harness/paths.js";
import { readLockFile, upsertLockEntry, writeLockFile } from "../install/lock.js";
import type { LockEntry } from "../install/source.js";
import { scanSkillPath } from "../skills-scan.js";
import { SEED_SKILLS, type SeedSkillDefinition } from "./seed-skills.js";

/** Default `memory/project.md` seed prompting the user to describe the repo. */
export const PROJECT_MEMORY_TEMPLATE = [
  "# Project",
  "",
  "<!-- Stable, rarely-changing facts about this project. Keep it short. -->",
  "",
  "- What it is:",
  "- Key technologies:",
  "- How to run it:",
].join("\n");

async function exists(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function hashSeedSkill(seed: SeedSkillDefinition): string {
  const hash = createHash("sha256");
  hash.update("threadroot-seed-skill-directory-v1\n");
  for (const [relativePath, content] of Object.entries(seed.files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`file:${relativePath}\n`);
    hash.update(content);
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function recordSeedLockEntry(repoRoot: string, seedName: (typeof SEED_SKILLS)[number]["name"], targetSkill: string): Promise<void> {
  const seed = SEED_SKILLS.find((entry) => entry.name === seedName);
  if (!seed) {
    return;
  }
  const scan = await scanSkillPath(targetSkill);
  const entry: LockEntry = {
    name: seed.name,
    kind: "skill",
    sourceKind: "local",
    source: seed.source,
    objectPath: `skills/${seed.name}`,
    integrity: `sha256:${hashSeedSkill(seed)}`,
    risk: scan.risk,
    registry: seed.registry,
    registryId: seed.registryId,
    installUrl: seed.installUrl,
    auditUrl: seed.auditUrl,
    upstreamSource: seed.upstreamSource,
    adaptedBy: "threadroot",
    reviewed: true,
    installedAt: new Date().toISOString(),
  };
  const lockPath = projectLockPath(repoRoot);
  const lock = await readLockFile(lockPath);
  await writeLockFile(lockPath, upsertLockEntry(lock, entry));
}

/** Write adaptive seed skills into the project harness. Skips existing skills. */
export async function writeSeedSkills(repoRoot: string): Promise<string[]> {
  const targetDir = projectObjectDir(repoRoot, "skills");
  await mkdir(targetDir, { recursive: true });

  const written: string[] = [];
  for (const seed of SEED_SKILLS) {
    const targetSkill = path.join(targetDir, seed.name);
    for (const [relativePath, content] of Object.entries(seed.files)) {
      const targetFile = path.join(targetSkill, relativePath);
      await mkdir(path.dirname(targetFile), { recursive: true });
      try {
        await writeFile(targetFile, content.endsWith("\n") ? content : `${content}\n`, { encoding: "utf8", flag: "wx" });
        if (relativePath === "SKILL.md") {
          written.push(targetFile);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
    }
    if (await exists(targetSkill)) {
      await recordSeedLockEntry(repoRoot, seed.name, targetSkill);
    }
  }

  return written;
}
