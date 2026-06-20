import { setupGlobal, type SetupMode } from "../core/setup.js";

export type SetupCliOptions = {
  global?: boolean;
  agent?: string;
  dryRun?: boolean;
  check?: boolean;
  undo?: boolean;
  force?: boolean;
  mcp?: boolean;
};

function modeFromOptions(options: SetupCliOptions): SetupMode {
  if (options.undo) return "undo";
  if (options.check) return "check";
  if (options.dryRun) return "dry-run";
  return "write";
}

export async function runSetup(_repoRoot: string, options: SetupCliOptions): Promise<void> {
  if (!options.global) {
    console.error("Only global setup is supported right now. Run `threadroot setup --global`.");
    process.exitCode = 1;
    return;
  }

  const mode = modeFromOptions(options);
  const result = await setupGlobal({
    agents: options.agent,
    mode,
    force: options.force,
    mcp: options.mcp,
  });

  const title =
    mode === "dry-run"
      ? "Global setup plan"
      : mode === "check"
        ? "Global setup check"
        : mode === "undo"
          ? "Global setup undo"
          : "Global setup complete";
  console.log(`${title}:`);
  for (const entry of result.entries) {
    const suffix = entry.message ? ` - ${entry.message}` : "";
    console.log(`- ${entry.label}: ${entry.status} ${entry.path}${suffix}`);
  }

  if (mode === "write") {
    console.log("Reload or restart open agent sessions so new global skills/config are discovered.");
  }
}

