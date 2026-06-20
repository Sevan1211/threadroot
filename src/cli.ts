import { Command } from "commander";
import { runCompileCommand, type CompileCliOptions } from "./commands/compile.js";
import { runContext } from "./commands/context.js";
import { runDiff } from "./commands/diff.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit, type InitCliOptions } from "./commands/init.js";
import { runInstall, type InstallCliOptions } from "./commands/install.js";
import { runMcp, runMcpSetup, type McpSetupOptions } from "./commands/mcp.js";
import { runMemoryAppend, runMemoryRead, runRemember, type RememberOptions } from "./commands/memory.js";
import { runStatus } from "./commands/status.js";
import {
  runToolRun,
  runToolsAdd,
  runToolsDetect,
  runToolsList,
  type ToolAddOptions,
  type ToolRunOptions,
} from "./commands/tools.js";

export function createProgram(repoRoot = process.cwd()): Command {
  const program = new Command();
  program
    .name("threadroot")
    .description("Git for your AI agent harness: one canonical source, compiled to every vendor format.")
    .version("0.1.0");

  program
    .command("init")
    .description("Scaffold a Threadroot harness, import existing vendor files once, and compile.")
    .option("--force", "Re-initialize over an existing harness.")
    .option("--no-import", "Skip importing existing vendor files (blank-slate init).")
    .option("--profile <profile>", "Override the detected project profile.")
    .option("--adapters <list>", "Comma-separated adapters: agents,claude,copilot,cursor.")
    .action((options: InitCliOptions) => runInit(repoRoot, options));

  program
    .command("status")
    .description("Show harness state, object counts, and compiled-output drift.")
    .action(() => runStatus(repoRoot));

  program
    .command("diff")
    .description("Show the diff between the canonical harness and each compiled vendor file.")
    .action(() => runDiff(repoRoot));

  program
    .command("doctor")
    .description("Check harness validity, compiled output health, MCP hints, and tool trust.")
    .action(() => runDoctor(repoRoot));

  program
    .command("compile")
    .option("--adapter <adapter>", "Restrict output to one adapter: agents, claude, copilot, or cursor.")
    .description("Compile the canonical harness into vendor files.")
    .action((options: CompileCliOptions) => runCompileCommand(repoRoot, options));

  program
    .command("context")
    .argument("<task>", "Task to assemble a relevant harness slice for.")
    .description("Assemble the task-relevant harness slice: skills, rules, tools, and memory.")
    .action((task: string) => runContext(repoRoot, task));

  program
    .command("run")
    .argument("<tool>", "Harness tool name.")
    .option("--input <pair...>", "Tool input as key=value (repeatable).")
    .option("-y, --yes", "Confirm running a tool marked confirm:true.")
    .option("--timeout <ms>", "Override the execution timeout in milliseconds.")
    .description("Execute a harness tool locally.")
    .action((tool: string, options: ToolRunOptions) => runToolRun(repoRoot, tool, options));

  program
    .command("install")
    .argument("<source>", "Object source: local path or git (github:owner/repo/path[@ref]).")
    .option("--kind <kind>", "Object kind: skill, tool, or rule (inferred when omitted).")
    .option("--path <path>", "Path to the object within a git source repo.")
    .option("--user", "Install into the user harness (~/.threadroot) instead of the project.")
    .description("Install a harness object from a local path or git source.")
    .action((source: string, options: InstallCliOptions) => runInstall(repoRoot, source, options));

  program
    .command("remember")
    .argument("<note>", "Durable note to record.")
    .option("--type <type>", "Memory type: project, current-focus, handoff, or pitfalls.")
    .description("Append a durable note to harness memory (defaults to handoff).")
    .action((note: string, options: RememberOptions) => runRemember(repoRoot, note, options));

  const memory = program.command("memory").description("Read and append durable harness memory.");
  memory
    .command("read")
    .argument("<type>", "Memory type: project, repo-map, current-focus, handoff, or pitfalls.")
    .description("Print a memory file.")
    .action((type: string) => runMemoryRead(repoRoot, type));
  memory
    .command("append")
    .argument("<type>", "Memory type: project, repo-map, current-focus, handoff, or pitfalls.")
    .argument("<note>", "Note to append.")
    .description("Append a durable note to memory.")
    .action((type: string, note: string) => runMemoryAppend(repoRoot, type, note));

  const tools = program.command("tools").description("Manage executable harness tools.");
  tools.command("list").description("List harness tools.").action(() => runToolsList(repoRoot));
  tools
    .command("detect")
    .description("Propose starter tools from the repo's existing command surface.")
    .action(() => runToolsDetect(repoRoot));
  tools
    .command("add")
    .argument("<name>", "Tool name (lowercase, hyphenated).")
    .requiredOption("--description <text>", "What the tool does.")
    .option("--run <command>", "Shell command (use {{param}} for inputs).")
    .option("--script <path>", "Harness-relative script path (alternative to --run).")
    .option("--confirm", "Require confirmation before running.")
    .option("--scope <scope>", "user or project.")
    .option("--force", "Overwrite an existing tool.")
    .description("Author a new harness tool.")
    .action((name: string, options: ToolAddOptions) => runToolsAdd(repoRoot, name, options));

  const mcp = program.command("mcp").description("Run or configure the local Threadroot MCP server.");
  mcp.action(() => runMcp(repoRoot));
  mcp
    .command("setup")
    .option("--agent <agent>", "all, generic, codex, copilot, cursor, or claude.")
    .option("--write", "Write project-local MCP config files for the agents.")
    .description("Print MCP config snippets and a pasteable agent bootstrap prompt.")
    .action((options: McpSetupOptions) => runMcpSetup(repoRoot, options));

  return program;
}
