import { Command } from "commander";
import {
  runCodexDoctor,
  runCodexInstall,
  runCodexRun,
  runCodexStatus,
  type CodexDoctorOptions,
  type CodexInstallOptions,
  type CodexRunCliOptions,
  type CodexStatusOptions,
} from "./commands/codex.js";
import { runEvalCodex } from "./commands/eval.js";
import { runInit, type InitCliOptions } from "./commands/init.js";
import { runMcp, runMcpCheck, type McpCheckOptions } from "./commands/mcp.js";
import { runPrep, type PrepCliOptions } from "./commands/prep.js";
import { runScoreLatest, type ScoreLatestOptions } from "./commands/score.js";
import { runTuneLatest, type TuneLatestOptions } from "./commands/tune.js";
import { THREADROOT_VERSION } from "./core/version.js";

export function createProgram(repoRoot = process.cwd()): Command {
  const program = new Command();
  program
    .name("threadroot")
    .description("Codex Context Optimizer: preflight small prompts, record Codex JSONL runs, score token waste, and tune repo context.")
    .version(THREADROOT_VERSION);

  program
    .command("init")
    .description("Initialize Codex-native Threadroot state and compact AGENTS.md guidance.")
    .option("--force", "Remove legacy .threadroot state before initializing.")
    .option("--yes", "Compatibility flag; init is non-interactive by default.")
    .option("--no-import", "Skip reading existing AGENTS.md prose for the init receipt.")
    .option("--profile <profile>", "Override the detected project profile.")
    .option("--gitignore", "Compatibility flag; .codex/threadroot is always added to root .gitignore.")
    .option("--adapters <list>", "Compatibility flag; ignored by Codex-native init.")
    .action((options: InitCliOptions) => runInit(repoRoot, options));

  program
    .command("prep")
    .argument("<task>", "Task to turn into a compact Codex-ready preflight brief.")
    .description("Create a compact Codex task brief without invoking Codex.")
    .option("--mode <mode>", "Budget mode: cheap, balanced, or deep.")
    .option("--memory <profile>", "Memory profile: conservative, tiny, or standard.")
    .option("--budget <tokens>", "Target prompt token budget.")
    .option("--hard-cap <tokens>", "Hard prompt token cap; fails when exceeded.")
    .option("--max-files <count>", "Maximum ranked non-test files to include.")
    .option("--force-index", "Refresh the repo index before compiling the brief.")
    .option("--require <command...>", "Verification command(s) Codex must satisfy.")
    .option("--json", "Print machine-readable JSON.")
    .action((task: string, options: PrepCliOptions) => runPrep(repoRoot, task, options));

  const codex = program.command("codex").description("Run, install, inspect, and verify the Codex/OpenAI integration.");
  codex
    .command("run")
    .argument("<task>", "Task to run through Preflight -> codex exec --json -> verification -> score.")
    .option("--mode <mode>", "Loop mode: cheap, balanced, or deep.")
    .option("--memory <profile>", "Memory profile: conservative, tiny, or standard.")
    .option("--codex-bin <command>", "Codex executable to run instead of `codex`.")
    .option("--ephemeral", "Run `codex exec --ephemeral` so Codex does not persist session state for this automation run.")
    .option("--timeout <ms>", "Codex execution timeout in milliseconds.")
    .option("--verify-timeout <ms>", "Per-command verification timeout in milliseconds.")
    .option("--require <command...>", "Verification command(s) Threadroot must run after Codex.")
    .option("--budget <tokens>", "Target prompt token budget.")
    .option("--hard-cap <tokens>", "Hard prompt token cap; fails when exceeded.")
    .option("--max-files <count>", "Maximum ranked non-test files to include.")
    .option("--force-index", "Refresh the repo index before compiling the brief.")
    .option("--dry-run", "Create the preflight and score skeleton without invoking Codex.")
    .option("--json", "Print machine-readable JSON.")
    .description("Run a subscription-friendly Codex optimization loop through `codex exec --json`.")
    .action((task: string, options: CodexRunCliOptions) => runCodexRun(repoRoot, task, options));
  codex
    .command("install")
    .option("--dry-run", "Show the Codex setup plan without writing the local install receipt.")
    .option("--check", "Check whether Threadroot has a local Codex install receipt.")
    .option("--status", "Show Codex install receipt status.")
    .option("--undo", "Remove Threadroot's local Codex install receipt.")
    .option("--refresh-skill", "Install or refresh the global Threadroot Codex skill in $HOME/.agents/skills.")
    .option("--json", "Print machine-readable JSON.")
    .description("Install Threadroot for Codex by recording local state and printing the Codex MCP setup command.")
    .action((options: CodexInstallOptions) => runCodexInstall(repoRoot, options));
  codex
    .command("status")
    .option("--json", "Print machine-readable JSON.")
    .description("Show Codex CLI, runner, and MCP availability.")
    .action((options: CodexStatusOptions) => runCodexStatus(repoRoot, options));
  codex
    .command("doctor")
    .option("--timeout <ms>", "MCP handshake timeout in milliseconds.")
    .option("--json", "Print machine-readable JSON.")
    .description("Run Codex-focused health checks, including Threadroot MCP handshake and tool availability.")
    .action((options: CodexDoctorOptions) => runCodexDoctor(repoRoot, options));

  program
    .command("status")
    .option("--json", "Print machine-readable JSON.")
    .description("Alias for `threadroot codex status`.")
    .action((options: CodexStatusOptions) => runCodexStatus(repoRoot, options));

  program
    .command("doctor")
    .option("--timeout <ms>", "MCP handshake timeout in milliseconds.")
    .option("--json", "Print machine-readable JSON.")
    .description("Alias for `threadroot codex doctor`.")
    .action((options: CodexDoctorOptions) => runCodexDoctor(repoRoot, options));

  const score = program.command("score").description("Inspect Codex optimizer score reports.");
  score
    .command("latest")
    .option("--json", "Print machine-readable JSON.")
    .description("Show latest tokens-to-green, context waste, verification status, and recommendations.")
    .action((options: ScoreLatestOptions) => runScoreLatest(repoRoot, options));

  const tune = program.command("tune").description("Use Codex run evidence to tune future preflight context.");
  tune
    .command("latest")
    .option("--json", "Print machine-readable JSON.")
    .description("Create evidence-backed routing and guidance proposals from the latest score.")
    .action((options: TuneLatestOptions) => runTuneLatest(repoRoot, options));

  const evalCommand = program.command("eval").description("Evaluate Threadroot optimizer quality.");
  evalCommand
    .command("codex")
    .option("--json", "Print machine-readable JSON.")
    .description("Compare raw Threadroot task packets against compact Codex preflight prompts.")
    .action((options) => runEvalCodex(repoRoot, options));

  const mcp = program.command("mcp").description("Run or check the local Threadroot MCP server for Codex.");
  mcp.action(() => runMcp(repoRoot));
  mcp
    .command("check")
    .option("--timeout <ms>", "Handshake timeout in milliseconds.")
    .option("--json", "Print machine-readable JSON.")
    .description("Verify Codex MCP config and the Threadroot stdio server handshake.")
    .action((options: McpCheckOptions) => runMcpCheck(repoRoot, options));

  return program;
}
