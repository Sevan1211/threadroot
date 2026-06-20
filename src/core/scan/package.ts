import fs from "node:fs/promises";
import path from "node:path";
import type { ConfigSignal, ProjectCommand, ProfileId } from "../../types.js";
import { configFiles } from "./rules.js";

export async function readJson(repoRoot: string, relativePath: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

export function scriptsFromPackageJson(value: unknown): ProjectCommand[] {
  if (!value || typeof value !== "object" || !("scripts" in value)) {
    return [];
  }

  const scripts = (value as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== "object") {
    return [];
  }

  return Object.entries(scripts)
    .filter(([, command]) => typeof command === "string")
    .map(([name, command]) => ({
      name,
      command: `pnpm ${name}`,
      purpose: `Detected package script: ${command}`,
    }));
}

export function inferProfile(files: string[], packageJson: unknown): ProfileId | "unknown" {
  if (files.some((file) => path.basename(file) === "dbt_project.yml" || path.basename(file) === "dbt_project.yaml")) {
    return "dbt";
  }

  const packageMeta =
    packageJson && typeof packageJson === "object"
      ? (packageJson as { bin?: unknown; scripts?: Record<string, unknown>; type?: unknown })
      : undefined;

  const dependencies =
    packageJson && typeof packageJson === "object"
      ? {
          ...(packageJson as { dependencies?: Record<string, unknown> }).dependencies,
          ...(packageJson as { devDependencies?: Record<string, unknown> }).devDependencies,
        }
      : {};

  if ("next" in dependencies) {
    return "nextjs";
  }

  if ("vite" in dependencies || files.some((file) => file.startsWith("vite.config."))) {
    return "vite-react";
  }

  if (
    packageMeta?.bin ||
    "commander" in dependencies ||
    "ink" in dependencies ||
    "tsup" in dependencies ||
    files.some((file) => file.startsWith("src/commands/"))
  ) {
    return "node-cli";
  }

  if (files.includes("pyproject.toml")) {
    return "python-cli";
  }

  return "unknown";
}

export function configSignals(files: string[], packageJson: unknown): ConfigSignal[] {
  const signals: ConfigSignal[] = [];

  for (const file of files) {
    if (configFiles.has(path.basename(file))) {
      signals.push({ path: file, label: "config", value: path.basename(file) });
    }
  }

  if (packageJson && typeof packageJson === "object") {
    const pkg = packageJson as { name?: unknown; packageManager?: unknown };
    if (typeof pkg.name === "string") {
      signals.push({ path: "package.json", label: "package name", value: pkg.name });
    }
    if (typeof pkg.packageManager === "string") {
      signals.push({ path: "package.json", label: "package manager", value: pkg.packageManager });
    }
  }

  return signals;
}
