import fs from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { generateFiles } from "./generate.js";
import { getProfile } from "./profiles.js";
import { readConfig } from "./config.js";
import { planWrites } from "./writer.js";
import type { ThreadrootConfig } from "../types.js";

export type DoctorIssue = {
  level: "error" | "warning";
  message: string;
};

export type DoctorAction = {
  command: string;
  reason: string;
};

export type DoctorResult = {
  ok: boolean;
  config?: ThreadrootConfig;
  issues: DoctorIssue[];
  actions: DoctorAction[];
};

export async function runDoctor(repoRoot: string): Promise<DoctorResult> {
  const issues: DoctorIssue[] = [];
  let config: ThreadrootConfig;

  try {
    config = await readConfig(repoRoot);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? "Malformed .threadroot/config.json."
        : "Missing or unreadable .threadroot/config.json.";
    return {
      ok: false,
      issues: [{ level: "error", message }],
      actions: [{ command: "threadroot start", reason: "Initialize Threadroot in this repository." }],
    };
  }

  const profile = getProfile(config.profile);
  if (!profile) {
    issues.push({ level: "error", message: `Unsupported profile: ${config.profile}` });
  }

  if (!profile.commands.some((command) => ["test", "validate", "build"].includes(command.name))) {
    issues.push({ level: "warning", message: "Profile does not define a validation command." });
  }

  for (const canonicalPath of [
    "threadroot/project.md",
    "threadroot/repo-map.md",
    "threadroot/current-focus.md",
    "threadroot/handoff.md",
    "threadroot/commands.md",
    "threadroot/architecture.md",
    "threadroot/pitfalls.md",
    "threadroot/automation.md",
  ]) {
    try {
      await fs.access(path.join(repoRoot, canonicalPath));
    } catch {
      issues.push({ level: "error", message: `Missing canonical context file: ${canonicalPath}` });
    }
  }

  const planned = await planWrites(repoRoot, generateFiles(config));
  for (const file of planned) {
    if (file.status === "create") {
      issues.push({ level: "error", message: `Missing generated file: ${file.path}` });
    }
    if (file.status === "stale") {
      issues.push({ level: "warning", message: `Stale generated file: ${file.path}` });
    }
    if (file.generated && file.status === "manual-edit") {
      issues.push({ level: "warning", message: `Generated file has manual edits: ${file.path}` });
    }
  }

  return {
    ok: issues.every((issue) => issue.level !== "error"),
    config,
    issues,
    actions: recommendedActions(issues),
  };
}

function recommendedActions(issues: DoctorIssue[]): DoctorAction[] {
  const actions = new Map<string, DoctorAction>();

  for (const issue of issues) {
    if (issue.message.includes("repo-map") || issue.message.includes("canonical context file")) {
      actions.set("threadroot maintain", {
        command: "threadroot maintain",
        reason: "Refresh repo map, memory review, and generated agent files together.",
      });
    }

    if (issue.message.includes("automation")) {
      actions.set("threadroot automation status", {
        command: "threadroot automation status",
        reason: "Review the recommended upkeep triggers for this repository.",
      });
    }

    if (issue.message.includes("Stale generated file") || issue.message.includes("manual edits")) {
      actions.set("threadroot refresh", {
        command: "threadroot refresh",
        reason: "Regenerate enabled agent/editor adapter outputs.",
      });
    }

    if (issue.message.includes("validation command")) {
      actions.set("threadroot refresh --memory", {
        command: "threadroot refresh --memory",
        reason: "Review memory and command context for missing validation guidance.",
      });
    }
  }

  if (issues.length > 0 && actions.size === 0) {
    actions.set("threadroot maintain", {
      command: "threadroot maintain",
      reason: "Run the standard Threadroot upkeep pass.",
    });
  }

  return [...actions.values()];
}
