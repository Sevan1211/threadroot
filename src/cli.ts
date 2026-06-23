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
import { runEvalContext, runEvalTraces, type EvalCliOptions, type TraceEvalCliOptions } from "./commands/eval.js";
import { runIndex, runIndexStatus, type IndexCliOptions } from "./commands/indexer.js";
import { runInit, type InitCliOptions } from "./commands/init.js";
import { runImport, type ImportCliOptions } from "./commands/import.js";
import { runImproveApply, runImproveLatest, type ImproveApplyOptions, type ImproveLatestOptions } from "./commands/improve.js";
import {
  runLoopFinish,
  runLoopNext,
  runLoopReport,
  runLoopRun,
  runLoopStart,
  type LoopFinishOptions,
  type LoopNextOptions,
  type LoopReportOptions,
  type LoopRunOptions,
  type LoopStartOptions,
} from "./commands/loop.js";
import { runMap, type MapCliOptions } from "./commands/map.js";
import { runMcp, runMcpCheck, type McpCheckOptions } from "./commands/mcp.js";
import { runProvidersStatus, type ProvidersOptions } from "./commands/providers.js";
import {
  runMemoryAppend,
  runMemoryGc,
  runMemoryRead,
  runRemember,
  type MemoryGcCliOptions,
  type RememberOptions,
} from "./commands/memory.js";
import { runRefresh, type RefreshCliOptions } from "./commands/refresh.js";
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
  runTraceEvent,
  runTraceFinish,
  runTraceLatest,
  runTraceStart,
  type TraceEventOptions,
  type TraceFinishOptions,
  type TraceLatestOptions,
  type TraceStartOptions,
} from "./commands/trace.js";
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
  runConnectionsDiscover,
  runConnectionsList,
  type ConnectionAddOptions,
  type ConnectionsDiscoverOptions,
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
    .option("--refresh-skill", "Install or refresh the global Threadroot agent skill for this provider.")
    .option("--json", "Print machine-readable JSON.")
    .description("Connect a coding agent to Threadroot without visible provider project files by default.")
    .action((agent: string | undefined, options: ConnectCliOptions) => runConnect(repoRoot, agent, options));

  program
    .command("status")
    .description("Show harness state, object counts, and compiled-output drift.")
    .option("--json", "Print machine-readable JSON.")
    .action((options) => runStatus(repoRoot, options));

  program
    .command("providers")
    .description("Show provider automation, MCP, and local CLI availability for Threadroot loops.")
    .option("--json", "Print machine-readable JSON.")
    .action((options: ProvidersOptions) => runProvidersStatus(repoRoot, options));

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
    .command("refresh")
    .description("Refresh the repo map and local intelligence index when stale.")
    .option("--force", "Refresh the repo map and index even when they appear current.")
    .option("--json", "Print machine-readable JSON.")
    .action((options: RefreshCliOptions) => runRefresh(repoRoot, options));

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
    .option("--min-recall <score>", "Exit non-zero when Recall@5 is below this score.")
    .option("--min-precision <score>", "Exit non-zero when Precision@5 is below this score.")
    .option("--min-ndcg <score>", "Exit non-zero when nDCG@5 is below this score.")
    .option("--max-average-tokens <tokens>", "Exit non-zero when average packet tokens exceed this value.")
    .description("Run built-in gold-context retrieval evals.")
    .action((options: EvalCliOptions) => runEvalContext(repoRoot, options));
  evalCommand
    .command("traces")
    .option("--latest", "Evaluate only the latest trace.")
    .option("--json", "Print machine-readable JSON.")
    .option("--min-recall <score>", "Exit non-zero when real-run Recall@5 is below this score.")
    .option("--min-mrr <score>", "Exit non-zero when real-run MRR is below this score.")
    .option("--max-failed-tool-runs <count>", "Exit non-zero when failed tool runs exceed this count.")
    .description("Evaluate real trace receipts: needed-file recall, tool failures, and loop evidence.")
    .action((options: TraceEvalCliOptions) => runEvalTraces(repoRoot, options));

  const trace = program.command("trace").description("Record local trace receipts for agent runs.");
  trace
    .command("start")
    .argument("<task>", "Task or goal this trace records.")
    .option("--agent <agent>", "Agent/provider label, such as codex or claude.")
    .option("--budget <tokens>", "Preferred task packet budget.")
    .option("--max-files <count>", "Maximum ranked non-test files in the starting packet.")
    .option("--force-index", "Refresh the repo index before compiling the starting packet.")
    .option("--json", "Print machine-readable JSON.")
    .description("Start an active trace and capture the starting task packet.")
    .action((task: string, options: TraceStartOptions) => runTraceStart(repoRoot, task, options));
  trace
    .command("event")
    .argument("<type>", "Event type: read_file, edit_file, run_tool, tool_blocked, command, eval, improvement, or note.")
    .option("--path <path>", "Repo-relative file path for read/edit events.")
    .option("--tool <tool>", "Harness tool name for tool events.")
    .option("--command <command>", "Command label for command/tool events.")
    .option("--exit-code <code>", "Command exit code, or null.")
    .option("--ok", "Mark the event as successful.")
    .option("--duration-ms <ms>", "Event duration in milliseconds.")
    .option("--message <message>", "Event note or summary.")
    .option("--json", "Print machine-readable JSON.")
    .description("Append an event to the active trace.")
    .action((type: Parameters<typeof runTraceEvent>[1], options: TraceEventOptions) => runTraceEvent(repoRoot, type, options));
  trace
    .command("finish")
    .option("--status <status>", "Final status: passed, failed, partial, blocked, or cancelled.")
    .option("--summary <summary>", "Short outcome summary.")
    .option("--json", "Print machine-readable JSON.")
    .description("Finish the active trace.")
    .action((options: TraceFinishOptions) => runTraceFinish(repoRoot, options));
  trace
    .command("latest")
    .option("--json", "Print machine-readable JSON.")
    .description("Show the latest trace receipt.")
    .action((options: TraceLatestOptions) => runTraceLatest(repoRoot, options));

  const embeddings = program.command("embeddings").description("Inspect built-in local vectors and configure optional external embedding adapters.");
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
    .description("Show built-in local vector status and optional external embedding adapter config.")
    .action((options) => runEmbeddingsStatus(repoRoot, options));
  embeddings
    .command("refresh")
    .option("--json", "Print machine-readable JSON.")
    .description("Refresh built-in local index vectors; external provider calls remain explicit.")
    .action((options) => runEmbeddingsRefresh(repoRoot, options));

  program
    .command("import")
    .option("--dry-run", "Detect provider files without writing an import report.")
    .option("--consolidate", "Prepare a consolidation report. Does not move provider files in this release.")
    .option("--move-provider-files", "Reserved for future explicit moves; currently errors rather than moving files.")
    .option("--json", "Print machine-readable JSON.")
    .description("Detect existing provider files and write a non-destructive .threadroot import report.")
    .action((options: ImportCliOptions) => runImport(repoRoot, options));

  const improve = program.command("improve").description("Generate and apply guarded local trace-driven improvements.");
  improve
    .command("latest")
    .option("--write-candidates", "Write pending candidates under .threadroot/improvements/pending/. Default when auto-apply is on.")
    .option("--no-auto-apply", "Do not apply guarded local trace-derived routing, eval, and skill lessons.")
    .option("--dry-run", "Report safe local lessons that would be applied without writing artifacts.")
    .option("--json", "Print machine-readable JSON.")
    .description("Analyze the latest trace and apply auto-safe local routing, eval, and skill lessons.")
    .action((options: ImproveLatestOptions) => runImproveLatest(repoRoot, options));
  improve
    .command("apply")
    .option("--auto-safe", "Compatibility flag; guarded auto-safe promotion is on by default.")
    .option("--no-auto-safe", "Disable guarded local trace-derived promotion and only report skipped candidates.")
    .option("--dry-run", "Report what would be applied without writing artifacts.")
    .option("--json", "Print machine-readable JSON.")
    .description("Apply safe trace-derived improvement candidates into local routing, eval, and skill artifacts.")
    .action((options: ImproveApplyOptions) => runImproveApply(repoRoot, options));

  const loop = program.command("loop").description("Run local Threadroot loop sessions for budgeted agent improvement.");
  loop
    .command("start")
    .argument("<goal>", "Loop goal.")
    .option("--agent <agent>", "Agent/provider label, such as codex or claude.")
    .option("--time <duration>", "Time budget, such as 30m or 1h.")
    .option("--max-iterations <count>", "Maximum iteration prompts.")
    .option("--risk <risk>", "Risk budget: low, medium, or high.")
    .option("--json", "Print machine-readable JSON.")
    .description("Start a manual/assisted loop session.")
    .action((goal: string, options: LoopStartOptions) => runLoopStart(repoRoot, goal, options));
  loop
    .command("next")
    .option("--json", "Print machine-readable JSON.")
    .description("Generate the next loop prompt and start its trace.")
    .action((options: LoopNextOptions) => runLoopNext(repoRoot, options));
  loop
    .command("report")
    .option("--json", "Print machine-readable JSON.")
    .description("Show loop status, latest trace eval, and improvement candidates.")
    .action((options: LoopReportOptions) => runLoopReport(repoRoot, options));
  loop
    .command("run")
    .option("--iterations <count>", "Maximum automated iterations to run.")
    .option("--agent-command <command>", "Provider command to execute instead of the default adapter.")
    .option("--agent-arg <arg...>", "Arguments passed to --agent-command.")
    .option("--agent-adapter <adapter>", "Parser adapter for --agent-command output: codex, claude, or custom.")
    .option("--timeout <ms>", "Per-iteration provider timeout in milliseconds.")
    .option("--require <command...>", "Verification command(s) Threadroot must run after each provider iteration.")
    .option("--verify-timeout <ms>", "Per-command verification timeout in milliseconds.")
    .option("--no-write-candidates", "Analyze improvements without writing pending candidate files.")
    .option("--no-auto-apply", "Do not apply auto-safe local trace-derived improvements after writing candidates.")
    .option("--json", "Print machine-readable JSON.")
    .description("Run budgeted loop iterations through a provider command.")
    .action((options: LoopRunOptions) => runLoopRun(repoRoot, options));
  loop
    .command("finish")
    .option("--status <status>", "Final status: finished or cancelled.")
    .option("--json", "Print machine-readable JSON.")
    .description("Finish the active loop session.")
    .action((options: LoopFinishOptions) => runLoopFinish(repoRoot, options));

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
    .command("discover")
    .option("--include-missing", "Include known connection templates whose CLI command is not on PATH.")
    .option("--json", "Print machine-readable JSON.")
    .description("Discover locally available CLI connection templates without creating manifests.")
    .action((options: ConnectionsDiscoverOptions) => runConnectionsDiscover(repoRoot, options));
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
