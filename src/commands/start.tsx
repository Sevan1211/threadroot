import { render } from "ink";
import React from "react";
import { createConfig, type InitInput } from "../core/config.js";
import { generateFiles } from "../core/generate.js";
import { applyWrites, planWrites } from "../core/writer.js";
import { InitApp } from "../tui/InitApp.js";
import { profileIdSchema, projectIntentSchema, strictnessSchema } from "../types.js";
import { currentProjectName, fileExists, parseTargets, printPlan, promptForPolicy } from "./shared.js";

export type StartOptions = {
  dryRun?: boolean;
  yes?: boolean;
  profile?: string;
  intent?: string;
  targets?: string;
  strictness?: string;
  projectName?: string;
  automation?: boolean;
};

export async function runStart(repoRoot: string, options: StartOptions): Promise<void> {
  const projectName = await currentProjectName(repoRoot, options.projectName);
  const inputFromFlags: InitInput | undefined =
    options.profile || options.intent || options.targets || options.strictness || options.projectName || options.automation
      ? {
          profile: profileIdSchema.parse(options.profile ?? "nextjs"),
          intent: projectIntentSchema.parse(options.intent ?? "portfolio"),
          projectName,
          targets: parseTargets(options.targets),
          strictness: strictnessSchema.parse(options.strictness ?? "standard"),
          automationEnabled: options.automation ?? false,
        }
      : undefined;

  const initInput =
    inputFromFlags ??
    (await new Promise<InitInput | undefined>((resolve) => {
      render(<InitApp projectName={projectName} onComplete={resolve} />);
    }));

  if (!initInput) {
    console.log("Threadroot init cancelled.");
    return;
  }

  const config = createConfig(initInput);
  const planned = await planWrites(
    repoRoot,
    generateFiles(config, {
      includeReadme: !(await fileExists(repoRoot, "README.md")),
      agentsPath: (await fileExists(repoRoot, "AGENTS.md")) ? "AGENTS.threadroot.md" : "AGENTS.md",
      automationEnabled: initInput.automationEnabled ?? false,
    }),
  );
  printPlan(planned);

  if (options.dryRun) {
    return;
  }

  const policy = options.yes ? "overwrite" : await promptForPolicy(repoRoot, planned);
  const written = await applyWrites(repoRoot, planned, policy);
  console.log(`Wrote ${written.filter((file) => file.status !== "unchanged").length} file(s).`);
}
