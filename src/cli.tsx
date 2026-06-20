import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { runAutomationStatus } from "./commands/automation.js";
import { runContextSuggest } from "./commands/context.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runMaintain, type MaintainOptions } from "./commands/maintain.js";
import { runMapRefresh, type MapOptions } from "./commands/map.js";
import { runRefresh, type RefreshOptions } from "./commands/refresh.js";
import { runRevamp, type RevampOptions } from "./commands/revamp.js";
import { runPromptAgent, runPromptMaintain, runPromptSkills } from "./commands/prompt.js";
import { runSkillsCreate, runSkillsList, runSkillsSuggest } from "./commands/skills.js";
import { runStart, type StartOptions } from "./commands/start.js";
import { MainMenuApp, type MainMenuChoice } from "./tui/MainMenuApp.js";
import { targetSchema } from "./types.js";

async function runMainMenu(repoRoot: string): Promise<void> {
  const choice = await new Promise<MainMenuChoice | undefined>((resolve) => {
    render(<MainMenuApp onComplete={resolve} />);
  });

  if (choice === "start") {
    await runStart(repoRoot, {});
  } else if (choice === "revamp") {
    await runRevamp(repoRoot, {});
  } else if (choice === "doctor") {
    await runDoctorCommand(repoRoot);
  } else if (choice === "refresh") {
    await runRefresh(repoRoot, undefined, {});
  }
}

export function createProgram(repoRoot = process.cwd()): Command {
  const program = new Command();
  program.name("threadroot").description("Create AI-ready VS Code repos for Codex and Copilot.").version("0.1.0");
  program.action(() => runMainMenu(repoRoot));

  program
    .command("start")
    .alias("init")
    .description("Start a new agent-ready project structure.")
    .option("--dry-run", "Preview planned files without writing.")
    .option("-y, --yes", "Overwrite generated/manual conflicts without prompting.")
    .option("--profile <profile>", "Project profile.")
    .option("--intent <intent>", "Project intent.")
    .option("--targets <targets>", "Comma-separated targets: codex,copilot,vscode.")
    .option("--strictness <strictness>", "light, standard, or strict.")
    .option("--project-name <name>", "Project name.")
    .action((options: StartOptions) => runStart(repoRoot, options));

  program
    .command("revamp")
    .description("Scan an existing project and preview a Threadroot memory structure.")
    .option("--write", "Write the proposed revamp after preview.")
    .option("-y, --yes", "Use detected defaults and overwrite generated/manual conflicts without prompting.")
    .option("--profile <profile>", "Override detected project profile.")
    .option("--intent <intent>", "Project intent.")
    .action((options: RevampOptions) => runRevamp(repoRoot, options));

  const refresh = program.command("refresh").description("Regenerate enabled Threadroot adapter outputs.");
  refresh
    .argument("[target]", "Optional target: codex, copilot, or vscode.")
    .option("--dry-run", "Preview planned files without writing.")
    .option("-y, --yes", "Overwrite generated/manual conflicts without prompting.")
    .option("--memory", "Review Threadroot memory and propose safe archive/offload actions.")
    .action((target: string | undefined, options: RefreshOptions) =>
      runRefresh(repoRoot, target ? targetSchema.parse(target) : undefined, options),
    );

  program.command("doctor").description("Check Threadroot setup health.").action(() => runDoctorCommand(repoRoot));
  program
    .command("maintain")
    .description("Refresh repo map, memory review, and generated agent adapters.")
    .option("--dry-run", "Preview planned files without writing.")
    .option("-y, --yes", "Overwrite generated/manual conflicts without prompting.")
    .action((options: MaintainOptions) => runMaintain(repoRoot, options));

  const automation = program.command("automation").description("Show opt-in Threadroot upkeep guidance.");
  automation
    .command("status")
    .description("Print recommended upkeep triggers for agents and humans.")
    .action(() => runAutomationStatus(repoRoot));

  const map = program.command("map").description("Build and refresh Threadroot repo maps.");
  map
    .command("refresh")
    .description("Refresh threadroot/repo-map.md and .threadroot/repo-map.json.")
    .option("--dry-run", "Preview planned files without writing.")
    .option("-y, --yes", "Overwrite generated/manual conflicts without prompting.")
    .action((options: MapOptions) => runMapRefresh(repoRoot, options));

  const context = program.command("context").description("Suggest targeted context for coding tasks.");
  context
    .command("suggest")
    .argument("<task>", "Task to route to relevant memory, skills, and code areas.")
    .description("Suggest the smallest useful context set for a task.")
    .action((task: string) => runContextSuggest(repoRoot, task));

  const skills = program.command("skills").description("List and suggest Threadroot skills.");
  skills.command("list").description("List skills relevant to this repo.").action(() => runSkillsList(repoRoot));
  skills
    .command("create")
    .argument("<slug>", "Project skill slug, for example add-billing-flow.")
    .option("--title <title>", "Human-readable skill title.")
    .option("--dry-run", "Preview planned files without writing.")
    .option("-y, --yes", "Overwrite generated/manual conflicts without prompting.")
    .description("Create a scaffold for a project-specific skill.")
    .action((slug: string, options: { title?: string; dryRun?: boolean; yes?: boolean }) =>
      runSkillsCreate(repoRoot, slug, options),
    );
  skills
    .command("suggest")
    .argument("<task>", "Task to route to relevant skills.")
    .description("Suggest the smallest useful skill set for a task.")
    .action((task: string) => runSkillsSuggest(repoRoot, task));

  const prompt = program.command("prompt").description("Print pasteable prompts for coding agents.");
  prompt.command("codex").description("Print a Codex bootstrap prompt.").action(() => runPromptAgent("codex"));
  prompt.command("copilot").description("Print a VS Code Copilot Chat bootstrap prompt.").action(() => runPromptAgent("copilot"));
  prompt.command("maintain").description("Print an end-of-session Threadroot maintenance prompt.").action(runPromptMaintain);
  prompt.command("skills").description("Print a prompt for generating project-specific skills.").action(runPromptSkills);

  return program;
}
