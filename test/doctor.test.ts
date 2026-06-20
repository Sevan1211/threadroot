import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doctor } from "../src/core/doctor.js";
import { initHarness } from "../src/core/init/index.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-doctor-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(repo, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

function codes(report: Awaited<ReturnType<typeof doctor>>): string[] {
  return report.findings.map((finding) => finding.code);
}

describe("doctor", () => {
  it("reports a clean initialized harness without errors", async () => {
    await write("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await initHarness(repo, { import: false, home: repo });
    await write(".vscode/mcp.json", JSON.stringify({ servers: { threadroot: { command: "threadroot", args: ["mcp"] } } }));

    const report = await doctor(repo, { home: repo });

    expect(report.ok).toBe(true);
    expect(report.summary.errors).toBe(0);
    expect(codes(report)).not.toContain("compiled_output_missing");
  });

  it("reports a missing harness as an error", async () => {
    const report = await doctor(repo, { home: repo });

    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("harness_invalid");
  });

  it("reports invalid manifests as errors", async () => {
    await write(".threadroot/harness.yaml", "name: demo\nversion: 1\nprofile: nope\nadapters:\n  - agents\n");

    const report = await doctor(repo, { home: repo });

    expect(report.ok).toBe(false);
    expect(report.findings[0]?.message).toContain("Invalid");
  });

  it("reports missing and drifted compiled outputs", async () => {
    await initHarness(repo, { import: false, home: repo });
    const agents = await readFile(path.join(repo, "AGENTS.md"), "utf8");

    await unlink(path.join(repo, "AGENTS.md"));
    const missing = await doctor(repo, { home: repo });
    expect(missing.ok).toBe(false);
    expect(codes(missing)).toContain("compiled_output_missing");

    await writeFile(path.join(repo, "AGENTS.md"), `${agents}\nmanual\n`);
    const drifted = await doctor(repo, { home: repo });

    expect(drifted.ok).toBe(true);
    expect(codes(drifted)).toContain("compiled_output_drift");
  });

  it("reports external tools missing from tools.allow as errors", async () => {
    await write(".threadroot/harness.yaml", "name: demo\nversion: 1\nprofile: node-cli\nadapters:\n  - agents\n");
    await write(".threadroot/tools/echo.yaml", "name: echo\ndescription: Echo\nrun: echo hi\n");
    await write(
      ".threadroot/lock.json",
      JSON.stringify(
        {
          version: 1,
          objects: [
            {
              name: "echo",
              kind: "tool",
              sourceKind: "git",
              source: "github:owner/repo/tools/echo.yaml",
              installedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = await doctor(repo, { home: repo });

    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("external_tool_not_allowed");
  });

  it("warns on external skills with scripts or allowed tools", async () => {
    await initHarness(repo, { import: false, home: repo });
    await write(
      ".threadroot/skills/release/SKILL.md",
      [
        "---",
        "name: release",
        "description: Use when releasing software with bundled scripts and pre-approved tools.",
        "allowed-tools:",
        "  - Bash",
        "---",
        "",
        "# Release",
        "",
        "Run the release checklist.",
      ].join("\n"),
    );
    await write(".threadroot/skills/release/scripts/release.sh", "echo release\n");
    await write(
      ".threadroot/lock.json",
      JSON.stringify(
        {
          version: 1,
          objects: [
            {
              name: "release",
              kind: "skill",
              sourceKind: "git",
              source: "github:owner/repo/skills/release",
              installedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = await doctor(repo, { home: repo });

    expect(report.ok).toBe(true);
    expect(codes(report)).toContain("external_skill_allowed_tools");
    expect(codes(report)).toContain("external_skill_scripts");
  });

  it("reports connection and tool health problems", async () => {
    await initHarness(repo, { import: false, home: repo });
    await write(
      ".threadroot/connections/missing-cli.yaml",
      [
        "name: missing-cli",
        "provider: missing",
        "command: threadroot-definitely-missing-cli",
        "description: Missing CLI connection",
        "risk: high",
      ].join("\n"),
    );
    await write(
      ".threadroot/tools/cloud.yaml",
      [
        "name: cloud",
        "description: Cloud command",
        "risk: medium",
        "connection: missing-cli",
        "run: echo cloud",
        "healthcheck:",
        "  run: exit 7",
      ].join("\n"),
    );

    const report = await doctor(repo, { home: repo });

    expect(report.ok).toBe(false);
    expect(codes(report)).toContain("high_risk_connection_without_confirm");
    expect(codes(report)).toContain("connection_check_failed");
    expect(codes(report)).toContain("tool_healthcheck_failed");
  });
});
