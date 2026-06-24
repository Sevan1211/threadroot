import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
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

function cap(text: string, maxOutputChars: number): string {
  if (text.length <= maxOutputChars) {
    return text;
  }
  return `${text.slice(0, maxOutputChars)}\n…[output truncated]`;
}

function terminateProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }).on("error", () => {
      child.kill(signal);
    });
    return;
  }
  child.kill(signal);
}

function runProcess(plan: SpawnPlan, opts: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputChars: number;
  signal?: AbortSignal;
}): Promise<ToolRunResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const spawnOptions: SpawnOptions = {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"],
    };
    let child: ChildProcess;
    if (plan.shell) {
      child = spawn(plan.file, { ...spawnOptions, shell: true });
    } else {
      child = spawn(plan.file, plan.args, { ...spawnOptions, shell: false });
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceResolveTimer: NodeJS.Timeout | undefined;

    const onAbort = () => {
      terminateProcess(child, "SIGTERM");
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const complete = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (forceResolveTimer) {
        clearTimeout(forceResolveTimer);
      }
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code,
        signal,
        stdout: cap(stdout, opts.maxOutputChars),
        stderr: cap(stderr, opts.maxOutputChars),
        durationMs: Date.now() - started,
        timedOut,
        command: plan.label,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcess(child, "SIGTERM");
      setTimeout(() => terminateProcess(child, "SIGKILL"), KILL_GRACE_MS).unref();
      forceResolveTimer = setTimeout(() => complete(null, "SIGKILL"), KILL_GRACE_MS + 500);
      forceResolveTimer.unref();
    }, opts.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < opts.maxOutputChars) {
        stdout += chunk.toString("utf8");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < opts.maxOutputChars) {
        stderr += chunk.toString("utf8");
      }
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (forceResolveTimer) {
        clearTimeout(forceResolveTimer);
      }
      opts.signal?.removeEventListener("abort", onAbort);
      reject(new ToolExecutionError(`Failed to start \`${plan.label}\`: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      complete(code, signal);
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
  maxOutputChars?: number;
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
      maxOutputChars: opts.maxOutputChars ?? MAX_OUTPUT_CHARS,
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
    maxOutputChars: opts.maxOutputChars ?? MAX_OUTPUT_CHARS,
    signal: opts.signal,
  });
}
