import { Command } from "commander";
import {
  runAutomationApprove,
  runAutomationReset,
  runAutomationStatus,
  type AutomationCliOptions,
} from "./commands/automation.js";
import { runBootstrap, type BootstrapCliOptions } from "./commands/bootstrap.js";
import { runCompileCommand, type CompileCliOptions } from "./commands/compile.js";
import { runContext } from "./commands/context.js";
import { runDiff } from "./commands/diff.js";
import { runDoctor } from "./commands/doctor.js";
import { runExpose, type ExposeCliOptions } from "./commands/expose.js";
import { runInit, type InitCliOptions } from "./commands/init.js";
import { runInstall, type InstallCliOptions } from "./commands/install.js";
import { runMcp, runMcpCheck, runMcpSetup, type McpCheckOptions, type McpSetupOptions } from "./commands/mcp.js";
import { runMemoryAppend, runMemoryRead, runRemember, type RememberOptions } from "./commands/memory.js";
import {
  runSkillsAdd,
  runSkillsExpose,
  runSkillsFind,
  runSkillsInspect,
  runSkillsList,
  runSkillsScan,
  runSkillsTrust,
  runSkillsValidate,
  type SkillsAddOptions,
  type SkillsExposeOptions,
  type SkillsFindOptions,
  type SkillsTrustOptions,
  type SkillsValidateOptions,
} from "./commands/skills.js";
import { runSetup, type SetupCliOptions } from "./commands/setup.js";
import { runStart, type StartCliOptions } from "./commands/start.js";
import { runStatus } from "./commands/status.js";
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
import { THREADROOT_VERSION } from "./core/version.js";

export function createProgram(repoRoot = process.cwd()): Command {
  const program = new Command();
  program
    .name("threadroot")
    .description("Adaptive AI agent capability harness: skills, tools, connections, memory, and MCP in .threadroot.")
    .version(THREADROOT_VERSION);

  program
    .command("bootstrap")
    .description("Plan or apply first-run Threadroot setup for this machine and repository.")
    .option("-y, --yes", "Apply the setup plan. Without --yes, bootstrap prints a dry-run plan.")
    .option("--dry-run", "Print the setup plan without writing files.")
    .option("--agent <list>", "Provider(s): codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .option("--task <task>", "Task used for the initial context slice.")
    .option("--mcp", "Also add Threadroot MCP to Codex global config when Codex is selected.")
    .option("--expose <list>", "Also write project provider skill shims: codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .option("--json", "Print machine-readable JSON.")
    .option("--no-global", "Skip one-time machine-level agent setup.")
    .option("--no-init", "Skip project harness initialization.")
    .option("--no-import", "Skip importing existing vendor files during init.")
    .option("--profile <profile>", "Override the detected project profile during init.")
    .action((options: BootstrapCliOptions) => runBootstrap(repoRoot, options));

  program
    .command("start")
    .argument("[task]", "Task to prepare context for.")
    .option("--task <task>", "Task to prepare context for.")
    .option("--json", "Print machine-readable JSON.")
    .description("Start a focused Threadroot agent session: doctor, status, context, and command map.")
    .action((task: string | undefined, options: StartCliOptions) => runStart(repoRoot, task, options));

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
    .option("--json", "Print machine-readable JSON.")
    .action((options) => runStatus(repoRoot, options));

  program
    .command("diff")
    .description("Show the diff between the canonical harness and each compiled vendor file.")
    .action(() => runDiff(repoRoot));

  program
    .command("doctor")
    .description("Check harness validity, compiled output health, MCP hints, and tool trust.")
    .option("--json", "Print machine-readable JSON.")
    .action((options) => runDoctor(repoRoot, options));

  program
    .command("compile")
    .option("--adapter <adapter>", "Restrict output to one adapter: agents, claude, copilot, or cursor.")
    .description("Compile the canonical harness into vendor files.")
    .action((options: CompileCliOptions) => runCompileCommand(repoRoot, options));

  program
    .command("context")
    .argument("<task>", "Task to assemble a relevant harness slice for.")
    .description("Assemble the task-relevant harness slice: skills, rules, tools, connections, and memory.")
    .option("--json", "Print machine-readable JSON.")
    .action((task: string, options) => runContext(repoRoot, task, options));

  program
    .command("run")
    .argument("<tool>", "Harness tool name.")
    .option("--input <pair...>", "Tool input as key=value (repeatable).")
    .option("-y, --yes", "Confirm running a tool marked confirm:true.")
    .option("--timeout <ms>", "Override the execution timeout in milliseconds.")
    .option("--json", "Print machine-readable JSON.")
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
  tools
    .command("list")
    .option("--json", "Print machine-readable JSON.")
    .description("List harness tools.")
    .action((options) => runToolsList(repoRoot, options));
  tools
    .command("check")
    .option("--json", "Print machine-readable JSON.")
    .description("Run configured tool healthchecks.")
    .action((options) => runToolsCheck(repoRoot, options));
  tools
    .command("detect")
    .option("--json", "Print machine-readable JSON.")
    .description("Propose starter tools from the repo's existing command surface.")
    .action((options) => runToolsDetect(repoRoot, options));
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
    .option("--json", "Print machine-readable JSON.")
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
    .option("--json", "Print machine-readable JSON.")
    .description("Guided safe tool builder.")
    .action((options: ToolCreateOptions) => runToolsCreate(repoRoot, options));

  const connections = program.command("connections").description("Manage local CLI connections.");
  connections
    .command("list")
    .option("--json", "Print machine-readable JSON.")
    .description("List harness connections.")
    .action((options) => runConnectionsList(repoRoot, options));
  connections
    .command("check")
    .option("--json", "Print machine-readable JSON.")
    .description("Run configured connection healthchecks.")
    .action((options) => runConnectionsCheck(repoRoot, options));
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
    .option("--allow <patterns>", "Comma-separated allowed command fragments for this connection.")
    .option("--deny <patterns>", "Comma-separated denied command fragments for this connection.")
    .option("--scope <scope>", "user or project.")
    .option("--force", "Overwrite an existing connection.")
    .option("--json", "Print machine-readable JSON.")
    .description("Author a local CLI connection manifest.")
    .action((name: string, options: ConnectionAddOptions) => runConnectionsAdd(repoRoot, name, options));

  const automation = program.command("automation").description("Control project-local safe agent automation.");
  automation
    .command("status")
    .option("--json", "Print machine-readable JSON.")
    .description("Show whether safe agent-created capabilities are approved for this project.")
    .action((options: AutomationCliOptions) => runAutomationStatus(repoRoot, options));
  automation
    .command("approve")
    .option("--json", "Print machine-readable JSON.")
    .description("Approve low-risk agent-created skills, tools, and connections for this project.")
    .action((options: AutomationCliOptions) => runAutomationApprove(repoRoot, options));
  automation
    .command("reset")
    .option("--json", "Print machine-readable JSON.")
    .description("Return project automation to ask-before-create mode.")
    .action((options: AutomationCliOptions) => runAutomationReset(repoRoot, options));

  const skills = program.command("skills").description("Inspect and validate harness skills.");
  skills
    .command("find")
    .argument("<query>", "Skill search query.")
    .option("--json", "Print machine-readable JSON.")
    .description("Find task-specific Agent Skills and return Threadroot install commands.")
    .action((query: string, options: SkillsFindOptions) => runSkillsFind(repoRoot, query, options));
  skills
    .command("add")
    .argument("<source>", "Skill source: owner/repo, skills:owner/repo/skill, skills.sh URL, GitHub URL, or local path.")
    .option("--user", "Install into the user harness (~/.threadroot) instead of the project.")
    .option("--path <path>", "Path to a skill inside the source repository.")
    .option("--skill <name>", "Skill name/slug inside a multi-skill source.")
    .option("--all", "Install every detected skill from a multi-skill source.")
    .option("--dry-run", "Detect and scan skills without writing files.")
    .option("--force", "Replace an existing installed skill.")
    .option("--strict", "Fail when the static scan reports anything above low risk.")
    .option("--no-snyk", "Skip optional Snyk Agent Scan integration.")
    .option("--require-snyk", "Fail unless Snyk Agent Scan runs and passes.")
    .option("--expose <agent>", "Also expose installed skill shims: universal, codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .option("--json", "Print machine-readable JSON.")
    .description("Install an external Agent Skill into `.threadroot/skills/` with scan and provenance.")
    .action((source: string, options: SkillsAddOptions) => runSkillsAdd(repoRoot, source, options));
  skills
    .command("list")
    .option("--json", "Print machine-readable JSON.")
    .description("List harness skills.")
    .action((options) => runSkillsList(repoRoot, options));
  skills
    .command("inspect")
    .argument("<path>", "Repo-relative skill file or skill directory.")
    .option("--json", "Print machine-readable JSON.")
    .description("Inspect a skill's metadata, references, scripts, assets, and eval files.")
    .action((targetPath: string, options) => runSkillsInspect(repoRoot, targetPath, options));
  skills
    .command("scan")
    .argument("<path>", "Repo-relative skill file or skill directory.")
    .option("--json", "Print machine-readable JSON.")
    .description("Run Threadroot's static risk scan for a skill.")
    .action((targetPath: string, options) => runSkillsScan(repoRoot, targetPath, options));
  skills
    .command("trust")
    .argument("<name>", "Installed skill name.")
    .option("--user", "Mark the user-scope installed skill as reviewed.")
    .option("--json", "Print machine-readable JSON.")
    .description("Mark an installed external skill as reviewed after human inspection.")
    .action((name: string, options: SkillsTrustOptions) => runSkillsTrust(repoRoot, name, options));
  skills
    .command("expose")
    .argument("<name-or-all>", "Skill name, comma-separated names, or all.")
    .option("--agent <agent>", "Provider target: universal, codex,claude,cursor,copilot,gemini,windsurf,antigravity,opencode,all.")
    .option("--dry-run", "Show provider skill shims that would be written.")
    .option("--force", "Replace existing unmanaged provider skill shims.")
    .option("--undo", "Remove Threadroot-managed provider skill shims.")
    .option("--json", "Print machine-readable JSON.")
    .description("Write thin provider-native shims for installed Threadroot skills.")
    .action((skill: string, options: SkillsExposeOptions) => runSkillsExpose(repoRoot, skill, options));
  skills
    .command("validate")
    .option("--path <path>", "Validate a repo-relative skill file, skill directory, or skill collection.")
    .option("--json", "Print machine-readable JSON.")
    .description("Validate skill frontmatter, naming, trigger descriptions, and progressive-disclosure hygiene.")
    .action((options: SkillsValidateOptions) => runSkillsValidate(repoRoot, options));

  const mcp = program.command("mcp").description("Run or configure the local Threadroot MCP server.");
  mcp.action(() => runMcp(repoRoot));
  mcp
    .command("check")
    .option("--timeout <ms>", "Handshake timeout in milliseconds.")
    .option("--json", "Print machine-readable JSON.")
    .description("Verify Codex MCP config and the Threadroot stdio server handshake.")
    .action((options: McpCheckOptions) => runMcpCheck(repoRoot, options));
  mcp
    .command("setup")
    .option("--agent <agent>", "all, generic, codex, copilot, cursor, or claude.")
    .option("--write", "Write project-local MCP config files for the agents.")
    .option("--json", "Print machine-readable JSON.")
    .description("Print MCP config snippets and a pasteable agent bootstrap prompt.")
    .action((options: McpSetupOptions) => runMcpSetup(repoRoot, options));

  return program;
}
