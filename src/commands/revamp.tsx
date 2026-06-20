import { render } from "ink";
import React from "react";
import { createConfig } from "../core/config.js";
import { generateFiles } from "../core/generate.js";
import { buildRevampContext, scanRepository } from "../core/scanner.js";
import { applyWrites, planWrites } from "../core/writer.js";
import { RevampApp, type RevampSelection } from "../tui/RevampApp.js";
import { profileIdSchema, projectIntentSchema } from "../types.js";
import { currentProjectName, printPlan, promptForPolicy } from "./shared.js";

export type RevampOptions = {
  write?: boolean;
  yes?: boolean;
  profile?: string;
  intent?: string;
  automation?: boolean;
};

export async function runRevamp(repoRoot: string, options: RevampOptions): Promise<void> {
  const scan = await scanRepository(repoRoot);
  const selection: RevampSelection | undefined =
    options.yes || options.profile
      ? { candidates: scan.candidates, automationEnabled: options.automation ?? false }
      : await new Promise<RevampSelection | undefined>((resolve) => {
          render(<RevampApp candidates={scan.candidates} onComplete={resolve} />);
        });

  if (!selection) {
    console.log("Threadroot revamp cancelled.");
    return;
  }
  const automationEnabled = options.automation ?? selection.automationEnabled;

  const revampContext = await buildRevampContext(repoRoot, { ...scan, candidates: selection.candidates });
  const config = createConfig({
    profile: profileIdSchema.parse(options.profile ?? (scan.likelyProfile === "unknown" ? "empty" : scan.likelyProfile)),
    intent: projectIntentSchema.parse(options.intent ?? "custom"),
    projectName: await currentProjectName(repoRoot),
    targets: ["codex", "copilot", "vscode"],
    strictness: "standard",
  });
  const agentsPath = scan.existingAgentFiles.includes("AGENTS.md") ? "AGENTS.threadroot.md" : "AGENTS.md";
  const planned = await planWrites(
    repoRoot,
    generateFiles(config, {
      includeReadme: false,
      agentsPath,
      automationEnabled,
      revampContext,
    }),
  );

  printPlan(planned);
  console.log(`Revamp sources selected: ${revampContext.selectedSources.length}`);
  console.log(`Codex guidance target: ${agentsPath}`);
  console.log(`Automation: ${automationEnabled ? "enabled" : "suggested only"}`);

  if (!options.write) {
    console.log("Dry run only. Re-run with --write to create the proposed Threadroot structure.");
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Revamped ${written.filter((file) => file.status !== "unchanged").length} file(s).`);
}
