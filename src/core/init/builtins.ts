import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectObjectDir } from "../harness/paths.js";

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT_FROM_BUNDLE = path.resolve(DIST_DIR, "..");
const PACKAGE_ROOT_FROM_DIST = path.resolve(DIST_DIR, "../../..");
const PACKAGE_ROOT_FROM_SRC = path.resolve(DIST_DIR, "../../../..");

const SKILL_PACK_CANDIDATES = [
  path.join(PACKAGE_ROOT_FROM_BUNDLE, "skills"),
  path.join(PACKAGE_ROOT_FROM_DIST, "skills"),
  path.join(PACKAGE_ROOT_FROM_SRC, "skills"),
];

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
  for (const candidate of SKILL_PACK_CANDIDATES) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  throw new Error("Bundled Threadroot skills were not found in this package.");
}

/** Write the curated starter skills into the project harness. Skips existing skills. */
export async function writeBuiltinSkills(repoRoot: string): Promise<string[]> {
  const sourceDir = await bundledSkillsDir();
  const targetDir = projectObjectDir(repoRoot, "skills");
  await mkdir(targetDir, { recursive: true });

  const written: string[] = [];
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sourceSkill = path.join(sourceDir, entry.name);
    const sourceSkillFile = path.join(sourceSkill, "SKILL.md");
    if (!(await exists(sourceSkill)) || !(await stat(sourceSkillFile).then((info) => info.isFile()).catch(() => false))) {
      continue;
    }

    const targetSkill = path.join(targetDir, entry.name);
    const targetSkillFile = path.join(targetSkill, "SKILL.md");
    try {
      await cp(sourceSkill, targetSkill, { recursive: true, force: false, errorOnExist: true });
      written.push(targetSkillFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ERR_FS_CP_EEXIST" && (error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  return written;
}
