import { HarnessError, resolveHarness } from "../core/harness/index.js";
import { createTool, detectToolCandidates, runTool } from "../core/tools/index.js";
import type { ProfileId } from "../types.js";

export type ToolRunOptions = {
  input?: string[];
  yes?: boolean;
  timeout?: string;
};

export type ToolAddOptions = {
  description?: string;
  run?: string;
  script?: string;
  confirm?: boolean;
  scope?: "user" | "project";
  force?: boolean;
};

function parseInputs(pairs: string[] = []): Record<string, string> {
  const input: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      throw new Error(`Invalid --input \`${pair}\`. Expected key=value.`);
    }
    input[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return input;
}

export async function runToolsList(repoRoot: string): Promise<void> {
  let harness;
  try {
    harness = await resolveHarness(repoRoot);
  } catch (error) {
    if (error instanceof HarnessError) {
      console.log("No harness found. Run `tr init` first.");
      return;
    }
    throw error;
  }

  if (harness.tools.length === 0) {
    console.log("No tools defined. Add one with `tr tools add` or `tr tools detect`.");
    return;
  }

  for (const tool of harness.tools) {
    const flags = [tool.manifest.confirm ? "confirm" : null, tool.manifest.run ? "shell" : "script"]
      .filter(Boolean)
      .join(", ");
    console.log(`${tool.name}  [${flags}]  - ${tool.manifest.description}`);
  }
}

export async function runToolRun(repoRoot: string, name: string, options: ToolRunOptions): Promise<void> {
  const outcome = await runTool(repoRoot, {
    name,
    input: parseInputs(options.input),
    confirmed: options.yes === true,
    timeoutMs: options.timeout ? Number(options.timeout) : undefined,
  });

  if (outcome.status === "blocked") {
    if (outcome.reason === "needs-confirmation") {
      console.log(`${outcome.message} Re-run with --yes to confirm.`);
    } else {
      console.log(outcome.message);
    }
    process.exitCode = 1;
    return;
  }

  const { result } = outcome;
  if (result.stdout) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  if (result.timedOut) {
    console.error(`Tool \`${name}\` timed out after ${result.durationMs}ms.`);
  }
  if (!result.ok) {
    process.exitCode = result.exitCode ?? 1;
  }
}

export async function runToolsAdd(repoRoot: string, name: string, options: ToolAddOptions): Promise<void> {
  if (!options.description) {
    throw new Error("`tr tools add` requires --description.");
  }
  if (!options.run && !options.script) {
    throw new Error("Provide either --run <command> or --script <path>.");
  }

  const created = await createTool(
    repoRoot,
    {
      name,
      description: options.description,
      run: options.run,
      script: options.script,
      confirm: options.confirm,
      scope: options.scope,
    },
    { actor: "human", force: options.force },
  );
  console.log(`Created ${created.scope} tool \`${name}\` at ${created.path}.`);
}

export async function runToolsDetect(repoRoot: string): Promise<void> {
  let profile: ProfileId | undefined;
  try {
    profile = (await resolveHarness(repoRoot)).manifest.profile;
  } catch (error) {
    if (!(error instanceof HarnessError)) {
      throw error;
    }
  }

  const candidates = await detectToolCandidates(repoRoot, profile ?? "empty");
  if (candidates.length === 0) {
    console.log("No starter tools detected.");
    return;
  }

  console.log("Proposed starter tools (materialize with `tr tools add`):");
  for (const candidate of candidates) {
    const confirm = candidate.confirm ? " (confirm)" : "";
    console.log(`- ${candidate.name}${confirm}: ${candidate.run}  [${candidate.source}]`);
  }
}
