import { spawn } from "node:child_process";
import path from "node:path";

import { projectHarnessDir, userHarnessDir } from "../harness/index.js";

export type ToolRunResult = {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  /** The shell command or resolved script invocation that ran. */
  command: string;
};

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 1_000_000;
const KILL_GRACE_MS = 2_000;

type SpawnPlan = {
  file: string;
  args: string[];
  shell: boolean;
  label: string;
};

const INTERPRETERS: Record<string, string> = {
  ".sh": "bash",
  ".bash": "bash",
  ".js": "node",
  ".cjs": "node",
  ".mjs": "node",
  ".py": "python3",
  ".rb": "ruby",
};

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…[output truncated]`;
}

function runProcess(plan: SpawnPlan, opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal }): Promise<ToolRunResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(plan.file, plan.args, {
      cwd: opts.cwd,
      env: opts.env,
      shell: plan.shell,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS).unref();
    }, opts.timeoutMs);

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_CHARS) {
        stdout += chunk.toString("utf8");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_CHARS) {
        stderr += chunk.toString("utf8");
      }
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(new ToolExecutionError(`Failed to start \`${plan.label}\`: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code,
        signal,
        stdout: cap(stdout),
        stderr: cap(stderr),
        durationMs: Date.now() - started,
        timedOut,
        command: plan.label,
      });
    });
  });
}

/** Plan how to invoke a script file based on its extension. */
function planScript(repoRoot: string, scriptRef: string): SpawnPlan {
  const resolved = path.resolve(repoRoot, scriptRef);
  const projectRoot = projectHarnessDir(repoRoot);
  const userRoot = userHarnessDir();
  const withinProject = resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`);
  const withinUser = resolved === userRoot || resolved.startsWith(`${userRoot}${path.sep}`);
  if (!withinProject && !withinUser) {
    throw new ToolExecutionError(`Script must live under the harness directory: ${scriptRef}`);
  }

  const interpreter = INTERPRETERS[path.extname(resolved).toLowerCase()];
  if (interpreter) {
    return { file: interpreter, args: [resolved], shell: false, label: `${interpreter} ${scriptRef}` };
  }
  return { file: resolved, args: [], shell: false, label: scriptRef };
}

export type ExecuteOptions = {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** Execute an interpolated shell `run` line in a subprocess. */
export function executeShell(command: string, opts: ExecuteOptions): Promise<ToolRunResult> {
  return runProcess(
    { file: command, args: [], shell: true, label: command },
    {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: opts.signal,
    },
  );
}

/** Execute a harness script file in a subprocess. */
export function executeScript(repoRoot: string, scriptRef: string, opts: ExecuteOptions): Promise<ToolRunResult> {
  let plan: SpawnPlan;
  try {
    plan = planScript(repoRoot, scriptRef);
  } catch (error) {
    return Promise.reject(error);
  }
  return runProcess(plan, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: opts.signal,
  });
}
