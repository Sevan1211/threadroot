import { exposeProject, type ExposeMode } from "../core/expose.js";

export type ExposeCliOptions = {
  dryRun?: boolean;
  check?: boolean;
  undo?: boolean;
  force?: boolean;
};

function modeFromOptions(options: ExposeCliOptions): ExposeMode {
  if (options.undo) return "undo";
  if (options.check) return "check";
  if (options.dryRun) return "dry-run";
  return "write";
}

export async function runExpose(repoRoot: string, agent: string | undefined, options: ExposeCliOptions): Promise<void> {
  const mode = modeFromOptions(options);
  const result = await exposeProject(repoRoot, {
    agents: agent,
    mode,
    force: options.force,
  });

  const verb =
    mode === "dry-run"
      ? "Project exposure plan"
      : mode === "check"
        ? "Project exposure check"
        : mode === "undo"
          ? "Removed project exposure"
          : "Exposed Threadroot project skills";
  console.log(`${verb}:`);

  for (const entry of result.entries) {
    const suffix = entry.message ? ` - ${entry.message}` : "";
    console.log(`- ${entry.label}: ${entry.status} ${entry.path}${suffix}`);
  }
}

