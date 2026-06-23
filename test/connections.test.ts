import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkConnection, createConnection, discoverConnectionCandidates } from "../src/core/connections/index.js";
import { connectionManifestSchema, type LoadedConnection } from "../src/core/harness/index.js";

let dir: string;
let originalPath: string | undefined;
let originalPathext: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "tr-connections-"));
  originalPath = process.env.PATH;
  originalPathext = process.env.PATHEXT;
});

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalPathext === undefined) {
    delete process.env.PATHEXT;
  } else {
    process.env.PATHEXT = originalPathext;
  }
  await rm(dir, { recursive: true, force: true });
});

function connection(partial: Record<string, unknown>): LoadedConnection {
  const manifest = connectionManifestSchema.parse(partial);
  return {
    name: manifest.name,
    origin: "project",
    sourcePath: path.join(dir, ".threadroot/connections", `${manifest.name}.yaml`),
    manifest,
  };
}

describe("connections", () => {
  it("creates a local CLI connection manifest", async () => {
    const created = await createConnection(dir, {
      name: "node-local",
      provider: "node",
      command: "node",
      risk: "low",
      healthcheck: "node --version",
    });

    expect(created.path).toContain(path.join(".threadroot", "connections", "node-local.yaml"));
    const content = await readFile(created.path, "utf8");
    expect(content).toContain("provider: node");
    expect(content).not.toContain("secret");
  });

  it("creates allow and deny policy rules", async () => {
    const created = await createConnection(dir, {
      name: "aws-dev",
      provider: "aws",
      command: "aws",
      risk: "high",
      allow: ["sts get-caller-identity", "s3 ls"],
      deny: ["delete", "terminate"],
    });

    expect(created.manifest.allow).toEqual(["sts get-caller-identity", "s3 ls"]);
    expect(created.manifest.deny).toEqual(["delete", "terminate"]);
    const content = await readFile(created.path, "utf8");
    expect(content).toContain("allow:");
    expect(content).toContain("deny:");
  });

  it("checks a configured connection healthcheck", async () => {
    const result = await checkConnection(
      dir,
      connection({
        name: "node-local",
        provider: "node",
        command: "node",
        description: "Local Node.js CLI",
        healthcheck: { run: "node --version" },
      }),
    );

    expect(result.status).toBe("ok");
  });

  it("reports missing commands", async () => {
    const result = await checkConnection(
      dir,
      connection({
        name: "missing-cli",
        provider: "missing",
        command: "threadroot-definitely-missing-cli",
        description: "Missing CLI",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("not found");
  });

  it("rejects invalid connection names", async () => {
    await expect(
      createConnection(dir, { name: "../bad", provider: "bad", command: "bad" }),
    ).rejects.toThrow(/Invalid connection name/);
  });

  it("loads from YAML through the schema", async () => {
    await writeFile(
      path.join(dir, "aws-dev.yaml"),
      [
        "name: aws-dev",
        "provider: aws",
        "command: aws",
        "description: AWS development account",
        "risk: high",
        "confirm: true",
      ].join("\n"),
    );
    const parsed = connectionManifestSchema.parse({
      name: "aws-dev",
      provider: "aws",
      command: "aws",
      description: "AWS development account",
      risk: "high",
      confirm: true,
    });
    expect(parsed.confirm).toBe(true);
  });

  it("discovers available local CLI connection templates without creating manifests", async () => {
    const bin = path.join(dir, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, process.platform === "win32" ? "gh.cmd" : "gh"), process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n", "utf8");
    if (process.platform !== "win32") {
      await chmod(path.join(bin, "gh"), 0o755);
    }
    process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ""}`;
    process.env.PATHEXT = ".COM;.EXE;.BAT;.CMD";

    const result = await discoverConnectionCandidates(dir);
    const github = result.candidates.find((candidate) => candidate.name === "github-local");

    expect(github).toMatchObject({
      provider: "github",
      command: "gh",
      status: "available",
      risk: "medium",
    });
    expect(github?.createCommand).toContain("threadroot connections add github-local");
    expect(github?.deny).toContain("secret");
  });
});
