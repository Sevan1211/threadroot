import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify as stringifyYaml } from "yaml";

import {
  type ObjectScope,
  type ToolInputParam,
  type ToolManifest,
  projectObjectDir,
  toolManifestSchema,
  userObjectDir,
} from "../harness/index.js";

export class ToolCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolCreateError";
  }
}

export type CreateToolInput = {
  name: string;
  description: string;
  run?: string;
  script?: string;
  confirm?: boolean;
  input?: Record<string, ToolInputParam>;
  scope?: ObjectScope;
};

export type CreateToolOptions = {
  /** Who is authoring. Agent-authored tools default to `confirm: true`. */
  actor: "agent" | "human";
  force?: boolean;
  home?: string;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function assertSafeName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new ToolCreateError(
      `Invalid tool name \`${name}\`. Use lowercase letters, numbers, and hyphens.`,
    );
  }
}

function assertSafeScript(script: string): void {
  if (path.isAbsolute(script) || script.split(/[\\/]/).includes("..")) {
    throw new ToolCreateError(`Script path must be inside the harness directory: ${script}`);
  }
}

export type CreatedTool = {
  path: string;
  scope: ObjectScope;
  manifest: ToolManifest;
};

/**
 * Author a new tool manifest. This only writes a validated YAML file — it never
 * executes anything. Agent-authored tools default to `confirm: true` so the
 * first invocation asks a human.
 */
export async function createTool(
  repoRoot: string,
  input: CreateToolInput,
  options: CreateToolOptions,
): Promise<CreatedTool> {
  assertSafeName(input.name);
  if (input.script) {
    assertSafeScript(input.script);
  }

  const confirm = input.confirm ?? options.actor === "agent";
  const scope: ObjectScope = input.scope ?? "project";

  const candidate = {
    name: input.name,
    description: input.description,
    scope,
    confirm,
    input: input.input ?? {},
    ...(input.run ? { run: input.run } : {}),
    ...(input.script ? { script: input.script } : {}),
  };

  const parsed = toolManifestSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new ToolCreateError(`Invalid tool definition: ${detail}`);
  }

  const dir = scope === "project" ? projectObjectDir(repoRoot, "tools") : userObjectDir("tools", options.home);
  const filePath = path.join(dir, `${input.name}.yaml`);

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, stringifyYaml(parsed.data), { encoding: "utf8", flag: options.force ? "w" : "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        throw new ToolCreateError(`Tool \`${input.name}\` already exists at ${filePath}. Pass force to overwrite.`);
      }
      throw error;
    },
  );

  return { path: filePath, scope, manifest: parsed.data };
}
