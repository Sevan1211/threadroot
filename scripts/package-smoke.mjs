#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${code}${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

const workDir = await mkdtemp(path.join(tmpdir(), "threadroot-package-smoke."));
const cacheDir = path.join(workDir, "npm-cache");
let tarballPath;

try {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const baseName = String(pkg.name).replace(/^@/, "").replace(/\//g, "-");
  tarballPath = path.join(repoRoot, `${baseName}-${pkg.version}.tgz`);

  await run("npm", ["--cache", cacheDir, "pack"]);
  if (!existsSync(tarballPath)) {
    throw new Error(`npm pack did not create ${tarballPath}.`);
  }

  const extractDir = path.join(workDir, "extract");
  const projectDir = path.join(workDir, "project");
  await mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", tarballPath, "-C", extractDir]);

  const packageDir = path.join(extractDir, "package");
  const repoNodeModules = path.join(repoRoot, "node_modules");
  if (!existsSync(repoNodeModules)) {
    throw new Error("node_modules is required for package smoke. Run `pnpm install` first.");
  }
  await symlink(repoNodeModules, path.join(packageDir, "node_modules"), "dir");

  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, "package.json"), '{"name":"threadroot-package-smoke"}\n', "utf8");

  const bin = path.join(packageDir, "dist", "index.js");
  await run(bin, ["--version"], { cwd: projectDir });
  await run(bin, ["init", "--no-import", "--profile", "node-cli", "--adapters", "agents"], { cwd: projectDir });
  await run(bin, ["packs", "list"], { cwd: projectDir });
  await run(bin, ["doctor"], { cwd: projectDir });
} finally {
  if (tarballPath) {
    await rm(tarballPath, { force: true });
  }
  await rm(workDir, { recursive: true, force: true });
}
