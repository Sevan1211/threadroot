import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG_PATH, MANIFEST_PATH } from "./paths.js";
import {
  threadrootConfigSchema,
  threadrootManifestSchema,
  type ProfileId,
  type ProjectIntent,
  type Strictness,
  type Target,
  type ThreadrootConfig,
  type ThreadrootManifest,
} from "../types.js";

export type InitInput = {
  profile: ProfileId;
  intent?: ProjectIntent;
  projectName: string;
  targets: Target[];
  strictness: Strictness;
  automationEnabled?: boolean;
};

export function createConfig(input: InitInput, now = new Date()): ThreadrootConfig {
  const timestamp = now.toISOString();
  return {
    version: 1,
    profile: input.profile,
    intent: input.intent ?? "custom",
    projectName: input.projectName,
    targets: input.targets,
    strictness: input.strictness,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function emptyManifest(): ThreadrootManifest {
  return {
    version: 1,
    files: {},
  };
}

export async function readConfig(repoRoot: string): Promise<ThreadrootConfig> {
  const raw = await fs.readFile(path.join(repoRoot, CONFIG_PATH), "utf8");
  return threadrootConfigSchema.parse(JSON.parse(raw));
}

export async function readManifest(repoRoot: string): Promise<ThreadrootManifest> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, MANIFEST_PATH), "utf8");
    return threadrootManifestSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyManifest();
    }

    throw error;
  }
}
