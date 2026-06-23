import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EffectiveHarness, LoadedTool } from "../src/core/harness/index.js";
import { connectionManifestSchema, harnessManifestSchema, toolManifestSchema } from "../src/core/harness/index.js";
import { compressRunOutput, createRunBrief } from "../src/core/run-brief.js";
import {
  ToolCreateError,
  ToolExecutionError,
  ToolInputError,
  authorizeTool,
  checkToolHealth,
  createTool,
  detectToolCandidates,
  executeScript,
  executeShell,
  inputEnv,
  interpolateRun,
  profileStarterTools,
  resolveInputs,
  runTool,
  shellQuote,
} from "../src/core/tools/index.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "tr-tools-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function tool(partial: Record<string, unknown>): LoadedTool {
  const manifest = toolManifestSchema.parse(partial);
  return { name: manifest.name, origin: "project", sourcePath: "x.yaml", manifest };
}

function harness(tools: LoadedTool[], allow: string[] = []): EffectiveHarness {
  return {
    manifest: harnessManifestSchema.parse({
      name: "demo",
      version: 1,
      profile: "node-cli",
      adapters: ["agents"],
      tools: { allow },
    }),
    skills: [],
    rules: [],
    tools,
    connections: [
      {
        name: "cloud-dev",
        origin: "project",
        sourcePath: ".threadroot/connections/cloud-dev.yaml",
        manifest: connectionManifestSchema.parse({
          name: "cloud-dev",
          provider: "test",
          command: "echo",
          description: "Test cloud connection",
          risk: "high",
        }),
      },
    ],
    memory: [],
  };
}

describe("interpolate", () => {
  it("resolves defaults, rejects missing and unknown inputs", () => {
    const manifest = toolManifestSchema.parse({
      name: "t",
      description: "d",
      run: "echo {{target}}",
      input: { target: { type: "string", default: "latest" }, count: { type: "number" } },
    });

    expect(resolveInputs(manifest, { count: 3 })).toEqual({ target: "latest", count: 3 });
    expect(() => resolveInputs(manifest, {})).toThrow(ToolInputError);
    expect(() => resolveInputs(manifest, { count: 1, bogus: 1 })).toThrow(/Unknown input/);
  });

  it("coerces and validates types", () => {
    const manifest = toolManifestSchema.parse({
      name: "t",
      description: "d",
      run: "x",
      input: { n: { type: "number" }, b: { type: "boolean" } },
    });
    expect(resolveInputs(manifest, { n: "42", b: "true" })).toEqual({ n: 42, b: true });
    expect(() => resolveInputs(manifest, { n: "nope", b: false })).toThrow(/must be a number/);
  });

  it("shell-quotes interpolated values to prevent injection", () => {
    expect(shellQuote("latest")).toBe("latest");
    expect(shellQuote("a b")).toBe("'a b'");
    const out = interpolateRun("deploy --to {{env}}", { env: "prod; rm -rf /" });
    expect(out).toBe("deploy --to 'prod; rm -rf /'");
  });

  it("rejects commands referencing undeclared inputs", () => {
    expect(() => interpolateRun("echo {{missing}}", {})).toThrow(ToolInputError);
  });

  it("exposes inputs as env vars", () => {
    expect(inputEnv({ "db-name": "app", n: 2 })).toEqual({
      TR_INPUT_JSON: JSON.stringify({ "db-name": "app", n: 2 }),
      TR_INPUT_DB_NAME: "app",
      TR_INPUT_N: "2",
    });
  });
});

describe("authorize", () => {
  it("allows trusted tools and gates untrusted ones on the allow-list", () => {
    const t = tool({ name: "build", description: "d", run: "echo hi" });
    expect(authorizeTool(t, { allow: [] }).allowed).toBe(true);
    expect(authorizeTool(t, { allow: [], trusted: false }).allowed).toBe(false);
    expect(authorizeTool(t, { allow: ["build"], trusted: false }).allowed).toBe(true);
  });

  it("requires confirmation for confirm:true tools", () => {
    const t = tool({ name: "migrate", description: "d", run: "echo hi", confirm: true });
    const blocked = authorizeTool(t, { allow: [] });
    expect(blocked).toEqual({ allowed: false, reason: "needs-confirmation", message: expect.any(String) });
    expect(authorizeTool(t, { allow: [], confirmed: true }).allowed).toBe(true);
  });

  it("requires confirmation for high-risk tools and high-risk connections", () => {
    const high = tool({ name: "deploy", description: "d", run: "echo hi", risk: "high" });
    expect(authorizeTool(high, { allow: [] })).toMatchObject({ allowed: false, reason: "needs-confirmation" });
    expect(authorizeTool(high, { allow: [], confirmed: true }).allowed).toBe(true);

    const medium = tool({ name: "inspect", description: "d", run: "echo hi", risk: "medium" });
    expect(authorizeTool(medium, { allow: [], connectionRisk: "high" })).toMatchObject({
      allowed: false,
      reason: "needs-confirmation",
    });
    const low = tool({ name: "identity", description: "d", run: "echo hi", risk: "low" });
    expect(authorizeTool(low, { allow: [], connectionRisk: "high" }).allowed).toBe(true);
  });
});

describe("execute", () => {
  const nodeCommand = (source: string): string => `${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`;

  it("runs a shell command and captures output + exit code", async () => {
    const ok = await executeShell(nodeCommand("console.log('hello')"), { cwd: dir });
    expect(ok.ok).toBe(true);
    expect(ok.stdout.trim()).toBe("hello");

    const fail = await executeShell(nodeCommand("process.exit(3)"), { cwd: dir });
    expect(fail.ok).toBe(false);
    expect(fail.exitCode).toBe(3);
  });

  it("creates compact run briefs with raw output stored locally", async () => {
    const result = await executeShell(
      nodeCommand("console.error('FAIL test/auth.test.ts:12 expected login'); process.exit(1)"),
      { cwd: dir },
    );
    const brief = await createRunBrief(dir, result);

    expect(brief.ok).toBe(false);
    expect(brief.rawOutputPath).toContain(".threadroot/cache/runs/");
    expect(brief.compactOutputPath).toContain(".threadroot/cache/runs/");
    expect(brief.failures[0]).toMatchObject({ path: "test/auth.test.ts", line: 12 });
    expect(brief.suggestedNextReads).toContain("test/auth.test.ts");
  });

  it("compresses repetitive output while preserving failure signals", () => {
    const output = [
      ...Array.from({ length: 80 }, () => "WARN retrying same thing"),
      "FAIL test/auth.test.ts:12 expected login",
    ].join("\n");
    const compact = compressRunOutput(output);

    expect(compact.text).toContain("test/auth.test.ts:12");
    expect(compact.text).toContain("x80 WARN retrying same thing");
    expect(compact.compression.estimatedTokensSaved).toBeGreaterThan(0);
    expect(compact.compression.pruners).toEqual(expect.arrayContaining(["repeated-lines", "failure-signals"]));
  });

  it("injects input env vars", async () => {
    const result = await executeShell(nodeCommand("console.log(process.env.TR_INPUT_NAME)"), {
      cwd: dir,
      env: inputEnv({ name: "world" }),
    });
    expect(result.stdout.trim()).toBe("world");
  });

  it("times out long-running commands", async () => {
    const result = await executeShell(nodeCommand("setTimeout(() => {}, 1000)"), {
      cwd: path.dirname(dir),
      timeoutMs: 100,
    });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("runs a harness script and rejects path traversal", async () => {
    await mkdir(path.join(dir, ".threadroot", "tools"), { recursive: true });
    await writeFile(path.join(dir, ".threadroot", "tools", "hi.mjs"), "console.log('scripted');\n");

    const result = await executeScript(dir, ".threadroot/tools/hi.mjs", { cwd: dir });
    expect(result.stdout.trim()).toBe("scripted");

    await expect(executeScript(dir, "../evil.sh", { cwd: dir })).rejects.toThrow(ToolExecutionError);
  });
});

describe("createTool", () => {
  it("writes a project tool and defaults agent tools to confirm", async () => {
    const human = await createTool(
      dir,
      { name: "build", description: "Build", run: "pnpm build" },
      { actor: "human" },
    );
    expect(human.manifest.confirm).toBe(false);
    expect(human.path).toContain(path.join(".threadroot", "tools", "build.yaml"));
    expect(await readFile(human.path, "utf8")).toContain("name: build");

    const agent = await createTool(
      dir,
      { name: "deploy", description: "Deploy", run: "deploy" },
      { actor: "agent" },
    );
    expect(agent.manifest.confirm).toBe(true);
  });

  it("rejects bad names, duplicates, and invalid definitions", async () => {
    await expect(
      createTool(dir, { name: "../evil", description: "d", run: "x" }, { actor: "human" }),
    ).rejects.toThrow(ToolCreateError);

    await createTool(dir, { name: "once", description: "d", run: "x" }, { actor: "human" });
    await expect(
      createTool(dir, { name: "once", description: "d", run: "x" }, { actor: "human" }),
    ).rejects.toThrow(/already exists/);

    await expect(
      createTool(dir, { name: "both", description: "d", run: "x", script: "s.sh" }, { actor: "human" }),
    ).rejects.toThrow(ToolCreateError);
  });
});

describe("catalog", () => {
  it("detects package.json scripts with the right package manager and confirm heuristic", async () => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { dev: "vite", "db:migrate": "prisma migrate deploy" } }),
    );
    await writeFile(path.join(dir, "pnpm-lock.yaml"), "");

    const candidates = await detectToolCandidates(dir, "node-cli");
    const dev = candidates.find((c) => c.name === "dev")!;
    const migrate = candidates.find((c) => c.name === "db-migrate")!;
    expect(dev.run).toBe("pnpm run dev");
    expect(migrate.confirm).toBe(true);
  });

  it("detects Makefile targets", async () => {
    await writeFile(path.join(dir, "Makefile"), "build:\n\tgo build\n\ntest:\n\tgo test ./...\n");
    const candidates = await detectToolCandidates(dir);
    expect(candidates.map((c) => c.name).sort()).toEqual(["build", "test"]);
    expect(candidates.find((c) => c.name === "build")!.run).toBe("make build");
  });

  it("falls back to profile starters when nothing is detected", async () => {
    const candidates = await detectToolCandidates(dir, "python-cli");
    expect(candidates.map((c) => c.name)).toContain("test");
    expect(candidates.every((c) => c.source === "profile")).toBe(true);
    expect(profileStarterTools("empty")).toEqual([]);
  });
});

describe("runTool", () => {
  it("interpolates inputs and executes", async () => {
    const t = tool({
      name: "greet",
      description: "d",
      run: "echo {{who}}",
      input: { who: { type: "string", default: "world" } },
    });
    const outcome = await runTool(dir, { harness: harness([t]), name: "greet" });
    expect(outcome.status).toBe("ran");
    if (outcome.status === "ran") {
      expect(outcome.result.stdout.trim()).toBe("world");
    }
  });

  it("runs tool healthchecks", async () => {
    const t = tool({
      name: "test",
      description: "d",
      run: "echo main",
      healthcheck: { run: "echo ok" },
    });
    const check = await checkToolHealth(dir, t);
    expect(check.status).toBe("ok");
  });

  it("blocks tools that reference unknown connections", async () => {
    const t = tool({ name: "cloud", description: "d", run: "echo x", connection: "missing" });
    const outcome = await runTool(dir, { harness: { ...harness([]), tools: [t], connections: [] }, name: "cloud" });
    expect(outcome).toMatchObject({ status: "blocked", reason: "not-allowed" });
  });

  it("enforces connection allow and deny command fragments", async () => {
    const allowed = tool({
      name: "identity",
      description: "d",
      run: "echo sts get-caller-identity",
      risk: "low",
      connection: "cloud-dev",
    });
    const disallowed = tool({
      name: "instances",
      description: "d",
      run: "echo ec2 describe-instances",
      risk: "low",
      connection: "cloud-dev",
    });
    const denied = tool({
      name: "delete",
      description: "d",
      run: "echo iam delete-role",
      risk: "low",
      connection: "cloud-dev",
    });
    const base = harness([allowed, disallowed, denied]);
    const policyHarness = {
      ...base,
      connections: [
        {
          ...base.connections[0]!,
          manifest: connectionManifestSchema.parse({
            ...base.connections[0]!.manifest,
            allow: ["sts get-caller-identity"],
            deny: ["delete"],
          }),
        },
      ],
    };

    expect(await runTool(dir, { harness: policyHarness, name: "identity" })).toMatchObject({ status: "ran" });
    await expect(runTool(dir, { harness: policyHarness, name: "instances" })).resolves.toMatchObject({
      status: "blocked",
      reason: "not-allowed",
    });
    await expect(runTool(dir, { harness: policyHarness, name: "delete" })).resolves.toMatchObject({
      status: "blocked",
      reason: "not-allowed",
    });
  });

  it("blocks confirm tools until confirmed", async () => {
    const t = tool({ name: "danger", description: "d", run: "echo x", confirm: true });
    const blocked = await runTool(dir, { harness: harness([t]), name: "danger" });
    expect(blocked.status).toBe("blocked");

    const ran = await runTool(dir, { harness: harness([t]), name: "danger", confirmed: true });
    expect(ran.status).toBe("ran");
  });

  it("throws on unknown tools", async () => {
    await expect(runTool(dir, { harness: harness([]), name: "nope" })).rejects.toThrow(/Unknown tool/);
  });
});
