import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ProfileId } from "../../types.js";

export type CandidateSource = "package.json" | "makefile" | "justfile" | "profile";

export type ToolCandidate = {
  name: string;
  description: string;
  run: string;
  confirm: boolean;
  source: CandidateSource;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const DESTRUCTIVE_RE = /\b(migrate|deploy|publish|release|prune|reset|destroy|drop|delete|rm|push|seed|wipe)\b/i;

/** Commands that mutate state get `confirm: true` by default. */
function looksDestructive(name: string, command: string): boolean {
  return DESTRUCTIVE_RE.test(name) || DESTRUCTIVE_RE.test(command);
}

function sanitize(name: string): string | undefined {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return NAME_RE.test(slug) ? slug : undefined;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(repoRoot: string): Promise<"pnpm" | "yarn" | "bun" | "npm"> {
  if (await exists(path.join(repoRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await exists(path.join(repoRoot, "yarn.lock"))) {
    return "yarn";
  }
  if (await exists(path.join(repoRoot, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

const SCRIPT_PRIORITY = ["dev", "start", "build", "test", "lint", "typecheck", "format"];

function orderScripts(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = SCRIPT_PRIORITY.indexOf(a);
    const bi = SCRIPT_PRIORITY.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    }
    return a.localeCompare(b);
  });
}

async function fromPackageJson(repoRoot: string): Promise<ToolCandidate[]> {
  const file = path.join(repoRoot, "package.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }

  let scripts: Record<string, string> = {};
  try {
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    scripts = parsed.scripts ?? {};
  } catch {
    return [];
  }

  const pm = await detectPackageManager(repoRoot);
  const candidates: ToolCandidate[] = [];
  for (const scriptName of orderScripts(Object.keys(scripts))) {
    const name = sanitize(scriptName);
    if (!name) {
      continue;
    }
    const command = scripts[scriptName] ?? "";
    candidates.push({
      name,
      description: `Run the \`${scriptName}\` package script`,
      run: `${pm} run ${scriptName}`,
      confirm: looksDestructive(scriptName, command),
      source: "package.json",
    });
  }
  return candidates;
}

async function fromTargets(
  repoRoot: string,
  fileName: string,
  runner: string,
  source: CandidateSource,
): Promise<ToolCandidate[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(repoRoot, fileName), "utf8");
  } catch {
    return [];
  }

  const candidates: ToolCandidate[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([a-zA-Z][\w-]*)\s*:/.exec(line);
    if (!match) {
      continue;
    }
    const target = match[1]!;
    if (target === "PHONY" || seen.has(target)) {
      continue;
    }
    seen.add(target);
    const name = sanitize(target);
    if (!name) {
      continue;
    }
    candidates.push({
      name,
      description: `Run the \`${target}\` ${source === "makefile" ? "Make target" : "recipe"}`,
      run: `${runner} ${target}`,
      confirm: looksDestructive(target, ""),
      source,
    });
  }
  return candidates;
}

const PROFILE_STARTERS: Record<ProfileId, ToolCandidate[]> = {
  nextjs: [
    starter("dev", "Start the Next.js dev server", "next dev"),
    starter("build", "Build the Next.js app", "next build"),
    starter("lint", "Lint with Next.js ESLint", "next lint"),
  ],
  "vite-react": [
    starter("dev", "Start the Vite dev server", "vite"),
    starter("build", "Build the app", "vite build"),
    starter("test", "Run the test suite", "vitest run"),
  ],
  fastapi: [
    starter("dev", "Run the FastAPI dev server", "uvicorn app.main:app --reload"),
    starter("test", "Run the test suite", "pytest"),
    starter("lint", "Lint with Ruff", "ruff check ."),
  ],
  "python-cli": [
    starter("test", "Run the test suite", "pytest"),
    starter("lint", "Lint with Ruff", "ruff check ."),
    starter("format", "Format with Ruff", "ruff format ."),
  ],
  "node-cli": [
    starter("build", "Build the project", "npm run build"),
    starter("test", "Run the test suite", "npm test"),
    starter("lint", "Lint the project", "npm run lint"),
  ],
  dbt: [
    starter("build", "Build dbt models", "dbt build"),
    starter("run", "Run dbt models", "dbt run"),
    starter("test", "Test dbt models", "dbt test"),
  ],
  empty: [],
};

function starter(name: string, description: string, run: string): ToolCandidate {
  return { name, description, run, confirm: looksDestructive(name, run), source: "profile" };
}

function dedupeByName(candidates: ToolCandidate[]): ToolCandidate[] {
  const seen = new Set<string>();
  const result: ToolCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.name)) {
      continue;
    }
    seen.add(candidate.name);
    result.push(candidate);
  }
  return result;
}

/** Curated fallback tools for a profile when nothing is detected. */
export function profileStarterTools(profile: ProfileId): ToolCandidate[] {
  return PROFILE_STARTERS[profile] ?? [];
}

/**
 * Determine which tools to offer for a repo. Strategy: wrap the project's
 * *existing* trusted command surface (package scripts, Make/just targets); fall
 * back to curated profile defaults only when nothing is detected. We never
 * invent or auto-run anything — these are proposals the human materializes.
 */
export async function detectToolCandidates(
  repoRoot: string,
  profile: ProfileId = "empty",
): Promise<ToolCandidate[]> {
  const detected = dedupeByName([
    ...(await fromPackageJson(repoRoot)),
    ...(await fromTargets(repoRoot, "Makefile", "make", "makefile")),
    ...(await fromTargets(repoRoot, "justfile", "just", "justfile")),
  ]);

  if (detected.length > 0) {
    return detected;
  }
  return profileStarterTools(profile);
}
