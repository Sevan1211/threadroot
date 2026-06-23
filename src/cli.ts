import { Command } from "commander";
import {
  runAutomationApprove,
  runAutomationReset,
  runAutomationStatus,
  type AutomationCliOptions,
} from "./commands/automation.js";
import { runConnect, type ConnectCliOptions } from "./commands/connect.js";
import { runDoctor } from "./commands/doctor.js";
import {
  runEmbeddingsConfigure,
  runEmbeddingsRefresh,
  runEmbeddingsStatus,
  type EmbeddingsConfigureOptions,
} from "./commands/embeddings.js";
import { runEvalContext, type EvalCliOptions } from "./commands/eval.js";
import { runIndex, runIndexStatus, type IndexCliOptions } from "./commands/indexer.js";
import { runInit, type InitCliOptions } from "./commands/init.js";
import { runImport, type ImportCliOptions } from "./commands/import.js";
import { runMap, type MapCliOptions } from "./commands/map.js";
import { runMcp, runMcpCheck, type McpCheckOptions } from "./commands/mcp.js";
import {
  runMemoryAppend,
  runMemoryGc,
  runMemoryRead,
  runRemember,
  type MemoryGcCliOptions,
  type RememberOptions,
} from "./commands/memory.js";
import {
  runSkillsFind,
  runSkillsIngest,
  runSkillsInspect,
  runSkillsList,
  runSkillsMatch,
  runSkillsScan,
  runSkillsTrust,
  runSkillsValidate,
  type SkillsFindOptions,
  type SkillsIngestOptions,
  type SkillsMatchOptions,
  type SkillsTrustOptions,
  type SkillsValidateOptions,
} from "./commands/skills.js";
import { runStatus } from "./commands/status.js";
import { runTask, type TaskCliOptions } from "./commands/task.js";
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
import { runWebFetch, runWebStatus, type WebFetchCliOptions, type WebStatusCliOptions } from "./commands/web.js";
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
    .description("Local repo intelligence runtime for coding agents: task packets, indexed context, skills, tools, memory, web fetch, and MCP in .threadroot.")
    .version(THREADROOT_VERSION);

  program
    .command("task")
    .argument("<task>", "Task to compile a repo-intelligence packet for.")
    .description("Compile the canonical task packet: indexed files, symbols, tests, commands, skills, memory, and risks.")
    .option("--budget <tokens>", "Preferred token budget for the returned task packet.")
    .option("--max-files <count>", "Maximum ranked non-test files to return.")
    .option("--debug-ranking", "Include retrieval scoring details.")
    .option("--force-index", "Refresh the repo index before compiling the packet.")
    .option("--json", "Print machine-readable JSON.")
    .action((task: string, options: TaskCliOptions) => runTask(repoRoot, task, options));

  program
    .command("init")
    .description("Scaffold a local-only Threadroot harness and import existing vendor files once.")
    .option("--force", "Re-initialize over an existing harness.")
    .option("--yes", "Compatibility flag; init is non-interactive by default.")
    .option("--no-import", "Skip importing existing vendor files (blank-slate init).")
    .option("--profile <profile>", "Override the detected project profile.")
    .option("--gitignore", "Write a visible root .gitignore entry instead of private .git/info/exclude.")
    .option("--adapters <list>", "Comma-separated adapters: agents,claude,copilot,cursor.")
    .action((options: InitCliOptions) => runInit(repoRoot, options));

  program
    .command("connect")
    .argument("[agent]", "Provider to connect: codex,claude,cursor,vscode,copilot,gemini,windsurf,opencode,antigravity,all.")
    .option("--all", "Connect all supported providers.")
    .option("--dry-run", "Show the provider setup plan without writing the .threadroot provider receipt.")
    .option("--check", "Check whether Threadroot has a local provider receipt.")
    .option("--status", "Show provider receipt status.")
    .option("--undo", "Remove Threadroot's local provider receipt.")
    .option("--project-files", "Allow visible project provider files when a provider requires them.")
    .option("--json", "Print machine-readable JSON.")
    .description("Connect a coding agent to Threadroot without visible provider project files by default.")
    .action((agent: string | undefined, options: ConnectCliOptions) => runConnect(repoRoot, agent, options));

  program
    .command("status")
    .description("Show harness state, object counts, and compiled-output drift.")
    .option("--json", "Print machine-readable JSON.")
    .action((options) => runStatus(repoRoot, options));

  program
    .command("doctor")
    .description("Check harness validity, compiled output health, MCP hints, and tool trust.")
    .option("--json", "Print machine-readable JSON.")
    .action((options) => runDoctor(repoRoot, options));

  program
    .command("index")
    .description("Build or inspect the local repo intelligence index.")
    .option("--force", "Rebuild even when a usable index exists.")
    .option("--status", "Show index status without rebuilding.")
    .option("--json", "Print machine-readable JSON.")
    .action((options: IndexCliOptions & { status?: boolean }) =>
      options.status ? runIndexStatus(repoRoot, options) : runIndex(repoRoot, options),
    );

  program
    .command("map")
    .description("Generate or check the compact repo map used for codebase-aware agent context.")
    .option("--write", "Write .threadroot/memory/repo-map.md.")
    .option("--check", "Exit non-zero when the repo map is missing or stale.")
    .option("--json", "Print machine-readable JSON.")
    .action((options: MapCliOptions) => runMap(repoRoot, options));

  program
    .command("run")
    .argument("<tool>", "Harness tool name.")
    .option("--input <pair...>", "Tool input as key=value (repeatable).")
    .option("-y, --yes", "Confirm running a tool marked confirm:true.")
    .option("--timeout <ms>", "Override the execution timeout in milliseconds.")
    .option("--brief", "Store full output locally and print a compact failure summary.")
    .option("--json", "Print machine-readable JSON.")
    .description("Execute a harness tool locally.")
    .action((tool: string, options: ToolRunOptions) => runToolRun(repoRoot, tool, options));

  const evalCommand = program.command("eval").description("Evaluate Threadroot context and routing quality.");
  evalCommand
    .command("context")
    .option("--json", "Print machine-readable JSON.")
    .description("Run built-in gold-context retrieval evals.")
    .action((options: EvalCliOptions) => runEvalContext(repoRoot, options));

  const embeddings = program.command("embeddings").description("Configure optional embedding retrieval adapters.");
  embeddings
    .command("configure")
    .option("--provider <provider>", "Embedding provider name.")
    .option("--model <model>", "Embedding model name.")
    .option("--endpoint <url>", "Provider endpoint or local service URL.")
    .option("--dimension <count>", "Vector dimension.")
    .option("--disable", "Disable configured embeddings.")
    .option("--json", "Print machine-readable JSON.")
    .description("Write explicit local embedding configuration. Does not call a provider.")
    .action((options: EmbeddingsConfigureOptions) => runEmbeddingsConfigure(repoRoot, options));
  embeddings
    .command("status")
    .option("--json", "Print machine-readable JSON.")
    .description("Show optional embedding adapter status.")
    .action((options) => runEmbeddingsStatus(repoRoot, options));
  embeddings
    .command("refresh")
    .option("--json", "Print machine-readable JSON.")
    .description("Refresh optional embeddings when an explicit adapter is available.")
    .action((options) => runEmbeddingsRefresh(repoRoot, options));

  program
    .command("import")
    .option("--dry-run", "Detect provider files without writing an import report.")
    .option("--consolidate", "Prepare a consolidation report. Does not move provider files in 0.1.9.")
    .option("--move-provider-files", "Reserved for future explicit moves; currently errors rather than moving files.")
    .option("--json", "Print machine-readable JSON.")
    .description("Detect existing provider files and write a non-destructive .threadroot import report.")
    .action((options: ImportCliOptions) => runImport(repoRoot, options));

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
  memory
    .command("gc")
    .option("--type <type>", "Compact one memory type instead of project, current-focus, handoff, and pitfalls.")
    .option("--max-entries <count>", "Maximum bullet entries to keep per memory file.")
    .option("--max-chars <count>", "Maximum body characters to keep per memory file.")
    .option("--dry-run", "Report compaction without writing files.")
    .option("--json", "Print machine-readable JSON.")
    .description("Dedupe and compact local memory, archiving trimmed notes under .threadroot/cache/memory/.")
    .action((options: MemoryGcCliOptions) => runMemoryGc(repoRoot, options));

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

  const web = program.command("web").description("Fetch known public web URLs with local cache and provenance.");
  web
    .command("status")
    .option("--json", "Print machine-readable JSON.")
    .description("Show Threadroot web capability status.")
    .action((options: WebStatusCliOptions) => runWebStatus(repoRoot, options));
  web
    .command("fetch")
    .argument("<url>", "Public http(s) URL to fetch.")
    .option("--max-tokens <tokens>", "Maximum approximate tokens of extracted content to return.")
    .option("--refresh", "Ignore cached content and fetch again.")
    .option("--json", "Print machine-readable JSON.")
    .description("Fetch a known public URL, extract text, and cache provenance under .threadroot/cache/web/.")
    .action((url: string, options: WebFetchCliOptions) => runWebFetch(repoRoot, url, options));

  const skills = program.command("skills").description("Inspect and validate harness skills.");
  skills
    .command("find")
    .argument("<query>", "Skill search query.")
    .option("--json", "Print machine-readable JSON.")
    .description("Find task-specific Agent Skills and return Threadroot install commands.")
    .action((query: string, options: SkillsFindOptions) => runSkillsFind(repoRoot, query, options));
  skills
    .command("match")
    .argument("<task>", "Task to match against installed skill metadata.")
    .option("--json", "Print machine-readable JSON.")
    .description("Recommend installed skills by metadata without loading full skill bodies.")
    .action((task: string, options: SkillsMatchOptions) => runSkillsMatch(repoRoot, task, options));
  skills
    .command("ingest")
    .argument("<source>", "Skill source URL, owner/repo, skills:owner/repo/skill, GitHub URL, or local path.")
    .option("--user", "Install into the user harness (~/.threadroot) instead of the project.")
    .option("--path <path>", "Path to a skill inside the source repository.")
    .option("--skill <name>", "Skill name/slug inside a multi-skill source.")
    .option("--all", "Install every detected skill from a multi-skill source.")
    .option("--dry-run", "Detect and scan skills without writing files.")
    .option("--force", "Replace an existing installed skill.")
    .option("--strict", "Fail when the static scan reports anything above low risk.")
    .option("--no-snyk", "Skip optional Snyk Agent Scan integration.")
    .option("--require-snyk", "Fail unless Snyk Agent Scan runs and passes.")
    .option("--json", "Print machine-readable JSON.")
    .description("Ingest a skill link or repo into `.threadroot/skills/` with scan, lock, and provenance.")
    .action((source: string, options: SkillsIngestOptions) => runSkillsIngest(repoRoot, source, options));
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

  return program;
}
