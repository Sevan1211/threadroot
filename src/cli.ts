import { Command } from "commander";
import { runCompileCommand, type CompileCliOptions } from "./commands/compile.js";
import { runContext } from "./commands/context.js";
import { runDiff } from "./commands/diff.js";
import { runDoctor } from "./commands/doctor.js";
import { runExpose, type ExposeCliOptions } from "./commands/expose.js";
import { runInit, type InitCliOptions } from "./commands/init.js";
import { runInstall, type InstallCliOptions } from "./commands/install.js";
import { runMcp, runMcpSetup, type McpSetupOptions } from "./commands/mcp.js";
import { runMemoryAppend, runMemoryRead, runRemember, type RememberOptions } from "./commands/memory.js";
import { runSkillsInspect, runSkillsList, runSkillsValidate, type SkillsValidateOptions } from "./commands/skills.js";
import { runSetup, type SetupCliOptions } from "./commands/setup.js";
import { runStatus } from "./commands/status.js";
import { runPacksInspect, runPacksInstall, runPacksList, runPacksValidate } from "./commands/packs.js";
import {
  runToolRun,
  runToolsAdd,
  runToolsCheck,
  runToolsCreate,
  runToolsDetect,
  runToolsList,
  type ToolAddOptions,
  type ToolCreateOptions,
  type ToolRunOptions,
} from "./commands/tools.js";
import {
  runConnectionsAdd,
  runConnectionsCheck,
  runConnectionsList,
  type ConnectionAddOptions,
} from "./commands/connections.js";

export function createProgram(repoRoot = process.cwd()): Command {
  const program = new Command();
  program
    .name("threadroot")
    .description("Git for your AI agent harness: one canonical .threadroot source, optional provider exposure.")
    .version("0.1.1");

  program
    .command("init")
    .description("Scaffold a local-only Threadroot harness and import existing vendor files once.")
    .option("--force", "Re-initialize over an existing harness.")
    .option("--no-import", "Skip importing existing vendor files (blank-slate init).")
    .option("--profile <profile>", "Override the detected project profile.")
    .option("--adapters <list>", "Comma-separated adapters: agents,claude,copilot,cursor.")
    .option("--expose <list>", "Comma-separated provider skill shims to write: codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .action((options: InitCliOptions) => runInit(repoRoot, options));

  program
    .command("expose")
    .argument("[agent]", "Provider(s) to expose: codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .option("--dry-run", "Show project files that would be written.")
    .option("--check", "Check current project exposure state.")
    .option("--undo", "Remove Threadroot-managed project exposure files.")
    .option("--force", "Replace an existing unmanaged threadroot skill.")
    .description("Write thin provider project skills that point agents at `.threadroot/`.")
    .action((agent: string | undefined, options: ExposeCliOptions) => runExpose(repoRoot, agent, options));

  program
    .command("setup")
    .option("--global", "Install machine-level Threadroot agent bootstrap skills/config.")
    .option("--agent <list>", "Provider(s): codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .option("--dry-run", "Show global files that would be written.")
    .option("--check", "Check global Threadroot setup state.")
    .option("--undo", "Remove Threadroot-managed global setup files/blocks.")
    .option("--force", "Replace an existing unmanaged threadroot skill.")
    .option("--mcp", "Also add Threadroot MCP to Codex global config when Codex is selected.")
    .description("Set up Threadroot once per machine for supported coding agents.")
    .action((options: SetupCliOptions) => runSetup(repoRoot, options));

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
    .option("--kind <kind>", "Object kind: skill, tool, rule, or connection (inferred when omitted).")
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
  tools.command("check").description("Run configured tool healthchecks.").action(() => runToolsCheck(repoRoot));
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
    .option("--risk <risk>", "Risk level: low, medium, or high.")
    .option("--connection <name>", "Connection this tool depends on.")
    .option("--healthcheck <command>", "Command that verifies the tool is available.")
    .option("--confirm", "Require confirmation before running.")
    .option("--scope <scope>", "user or project.")
    .option("--force", "Overwrite an existing tool.")
    .description("Author a new harness tool.")
    .action((name: string, options: ToolAddOptions) => runToolsAdd(repoRoot, name, options));
  tools
    .command("create")
    .option("--from-command <command>", "Create a tool around an existing command.")
    .option("--description <text>", "What the tool does.")
    .option("--risk <risk>", "Risk level: low, medium, or high.")
    .option("--connection <name>", "Connection this tool depends on.")
    .option("--healthcheck <command>", "Command that verifies the tool is available.")
    .option("--confirm", "Require confirmation before running.")
    .option("--scope <scope>", "user or project.")
    .option("--force", "Overwrite an existing tool.")
    .description("Guided safe tool builder.")
    .action((options: ToolCreateOptions) => runToolsCreate(repoRoot, options));

  const connections = program.command("connections").description("Manage local CLI connections.");
  connections.command("list").description("List harness connections.").action(() => runConnectionsList(repoRoot));
  connections.command("check").description("Run configured connection healthchecks.").action(() => runConnectionsCheck(repoRoot));
  connections
    .command("add")
    .argument("<name>", "Connection name (lowercase, hyphenated).")
    .requiredOption("--provider <provider>", "Provider name, such as aws, github, azure, or snowflake.")
    .requiredOption("--command <command>", "Local CLI command, such as aws, gh, az, or snow.")
    .option("--description <text>", "What this connection is for.")
    .option("--profile <profile>", "Local CLI profile/account label.")
    .option("--risk <risk>", "Risk level: low, medium, or high.")
    .option("--confirm", "Require confirmation before connection-backed tools run.")
    .option("--healthcheck <command>", "Command that verifies the connection works.")
    .option("--scope <scope>", "user or project.")
    .option("--force", "Overwrite an existing connection.")
    .description("Author a local CLI connection manifest.")
    .action((name: string, options: ConnectionAddOptions) => runConnectionsAdd(repoRoot, name, options));

  const packs = program.command("packs").description("Inspect, validate, and install capability packs.");
  packs.command("list").description("List built-in and repo-local packs.").action(() => runPacksList(repoRoot));
  packs
    .command("inspect")
    .argument("<name-or-path>", "Built-in pack name or repo-relative pack path.")
    .description("Inspect a capability pack.")
    .action((nameOrPath: string) => runPacksInspect(repoRoot, nameOrPath));
  packs
    .command("validate")
    .argument("<name-or-path>", "Built-in pack name or repo-relative pack path.")
    .description("Validate a capability pack.")
    .action((nameOrPath: string) => runPacksValidate(repoRoot, nameOrPath));
  packs
    .command("install")
    .argument("<name-or-path>", "Built-in pack name or repo-relative pack path.")
    .description("Install a capability pack into the project harness.")
    .action((nameOrPath: string) => runPacksInstall(repoRoot, nameOrPath));

  const skills = program.command("skills").description("Inspect and validate harness skills.");
  skills.command("list").description("List harness skills.").action(() => runSkillsList(repoRoot));
  skills
    .command("inspect")
    .argument("<path>", "Repo-relative skill file or skill directory.")
    .description("Inspect a skill's metadata, references, scripts, assets, and eval files.")
    .action((targetPath: string) => runSkillsInspect(repoRoot, targetPath));
  skills
    .command("validate")
    .option("--path <path>", "Validate a repo-relative skill file, skill directory, or skill collection.")
    .description("Validate skill frontmatter, naming, trigger descriptions, and progressive-disclosure hygiene.")
    .action((options: SkillsValidateOptions) => runSkillsValidate(repoRoot, options));

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
