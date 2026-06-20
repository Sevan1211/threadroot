import { type InstallScope, installObject } from "../core/install/index.js";

export type InstallCliOptions = {
  kind?: string;
  path?: string;
  user?: boolean;
};

const KINDS = new Set(["skill", "tool", "rule"]);

export async function runInstall(repoRoot: string, source: string, options: InstallCliOptions): Promise<void> {
  if (options.kind && !KINDS.has(options.kind)) {
    console.error(`Invalid --kind \`${options.kind}\` (expected skill, tool, or rule).`);
    process.exitCode = 1;
    return;
  }

  const scope: InstallScope = options.user ? "user" : "project";

  try {
    const installed = await installObject(repoRoot, source, {
      kind: options.kind as "skill" | "tool" | "rule" | undefined,
      objectPath: options.path,
      scope,
    });
    console.log(`installed ${installed.kind} \`${installed.name}\` (${scope})`);
    console.log(`  path: ${installed.path}`);
    if (installed.entry.resolved) {
      console.log(`  commit: ${installed.entry.resolved}`);
    }
    if (installed.entry.integrity) {
      console.log(`  integrity: ${installed.entry.integrity}`);
    }
    if (installed.kind === "tool" && installed.entry.sourceKind !== "local") {
      console.log("  note: installed tools are untrusted; add to `tools.allow` in harness.yaml to run.");
    }
  } catch (error) {
    console.error(`Install failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
