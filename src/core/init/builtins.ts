import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectLockPath, projectObjectDir } from "../harness/paths.js";
import { readLockFile, upsertLockEntry, writeLockFile } from "../install/lock.js";
import type { LockEntry } from "../install/source.js";
import { scanSkillPath } from "../skills-scan.js";

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT_FROM_BUNDLE = path.resolve(DIST_DIR, "..");
const PACKAGE_ROOT_FROM_DIST = path.resolve(DIST_DIR, "../../..");
const PACKAGE_ROOT_FROM_SRC = path.resolve(DIST_DIR, "../../../..");

const SKILLS_DIR_CANDIDATES = [
  path.join(PACKAGE_ROOT_FROM_BUNDLE, "skills"),
  path.join(PACKAGE_ROOT_FROM_DIST, "skills"),
  path.join(PACKAGE_ROOT_FROM_SRC, "skills"),
];

const SEED_SKILLS = [
  {
    name: "create-connection",
    source: "threadroot:seed/create-connection",
  },
  {
    name: "create-skill",
    source: "threadroot:seed/create-skill",
    upstreamSource: "https://www.skills.sh/anthropics/skills/skill-creator",
    registry: "skills.sh",
    registryId: "anthropics/skills/skill-creator",
    installUrl: "https://github.com/anthropics/skills",
    auditUrl: "https://www.skills.sh/anthropics/skills/skill-creator",
  },
  {
    name: "create-tool",
    source: "threadroot:seed/create-tool",
  },
  {
    name: "find-skills",
    source: "threadroot:seed/find-skills",
    upstreamSource: "https://www.skills.sh/vercel-labs/skills/find-skills",
    registry: "skills.sh",
    registryId: "vercel-labs/skills/find-skills",
    installUrl: "https://github.com/vercel-labs/skills",
    auditUrl: "https://www.skills.sh/vercel-labs/skills/find-skills",
  },
] as const;

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

export async function bundledSkillsDir(): Promise<string> {
  for (const candidate of SKILLS_DIR_CANDIDATES) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  throw new Error("Bundled Threadroot skills were not found in this package.");
}

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update("threadroot-seed-skill-directory-v1\n");

  async function walk(dir: string): Promise<void> {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile()) {
        hash.update(`file:${rel}\n`);
        hash.update(await readFile(full));
        hash.update("\n");
      }
    }
  }

  await walk(root);
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
    integrity: `sha256:${await hashDirectory(targetSkill)}`,
    risk: scan.risk,
    registry: "registry" in seed ? seed.registry : undefined,
    registryId: "registryId" in seed ? seed.registryId : undefined,
    installUrl: "installUrl" in seed ? seed.installUrl : undefined,
    auditUrl: "auditUrl" in seed ? seed.auditUrl : undefined,
    upstreamSource: "upstreamSource" in seed ? seed.upstreamSource : undefined,
    adaptedBy: "threadroot",
    reviewed: true,
    installedAt: new Date().toISOString(),
  };
  const lockPath = projectLockPath(repoRoot);
  const lock = await readLockFile(lockPath);
  await writeLockFile(lockPath, upsertLockEntry(lock, entry));
}

/** Write the four adaptive seed skills into the project harness. Skips existing skills. */
export async function writeSeedSkills(repoRoot: string): Promise<string[]> {
  const sourceDir = await bundledSkillsDir();
  const targetDir = projectObjectDir(repoRoot, "skills");
  await mkdir(targetDir, { recursive: true });

  const written: string[] = [];
  for (const seed of SEED_SKILLS) {
    const sourceSkill = path.join(sourceDir, seed.name);
    const sourceSkillFile = path.join(sourceSkill, "SKILL.md");
    if (!(await exists(sourceSkill)) || !(await stat(sourceSkillFile).then((info) => info.isFile()).catch(() => false))) {
      throw new Error(`Bundled Threadroot seed skill is missing: ${seed.name}`);
    }

    const targetSkill = path.join(targetDir, seed.name);
    const targetSkillFile = path.join(targetSkill, "SKILL.md");
    try {
      await cp(sourceSkill, targetSkill, { recursive: true, force: false, errorOnExist: true });
      written.push(targetSkillFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ERR_FS_CP_EEXIST" && (error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    if (await exists(targetSkill)) {
      await recordSeedLockEntry(repoRoot, seed.name, targetSkill);
    }
  }

  return written;
}
