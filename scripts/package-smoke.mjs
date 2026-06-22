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
  const homeDir = path.join(workDir, "home");
  await mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", tarballPath, "-C", extractDir]);

  const packageDir = path.join(extractDir, "package");
  if (existsSync(path.join(packageDir, "skills"))) {
    throw new Error("Packed package must not include top-level skills/. Seed skills are source-owned.");
  }
  if (existsSync(path.join(packageDir, "packs"))) {
    throw new Error("Packed package must not include packs/.");
  }
  const repoNodeModules = path.join(repoRoot, "node_modules");
  if (!existsSync(repoNodeModules)) {
    throw new Error("node_modules is required for package smoke. Run `pnpm install` first.");
  }
  await symlink(repoNodeModules, path.join(packageDir, "node_modules"), "dir");

  await mkdir(projectDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await writeFile(path.join(projectDir, "package.json"), '{"name":"threadroot-package-smoke"}\n', "utf8");

  const bin = path.join(packageDir, "dist", "index.js");
  await run(bin, ["--version"], { cwd: projectDir });
  await run(bin, ["bootstrap", "--yes", "--agent", "codex", "--mcp", "--no-import", "--profile", "node-cli"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  await run(bin, ["mcp", "check"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["map", "--check"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["start", "write tests"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["skills", "inspect", ".threadroot/skills/threadroot"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["skills", "inspect", ".threadroot/skills/find-skills"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["automation", "status"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["automation", "approve"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["expose", "codex"], { cwd: projectDir });
  const externalSkillDir = path.join(projectDir, "external-skill");
  await mkdir(externalSkillDir, { recursive: true });
  await writeFile(
    path.join(externalSkillDir, "SKILL.md"),
    [
      "---",
      "name: package-smoke-skill",
      "description: Use when validating package smoke skill installation.",
      "license: MIT",
      "compatibility: Agent Skills-compatible clients.",
      "---",
      "",
      "# package-smoke-skill",
      "",
      "Validate the packaged skills add workflow.",
      "",
    ].join("\n"),
    "utf8",
  );
  await run(bin, ["skills", "add", "./external-skill", "--dry-run", "--no-snyk"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["skills", "add", "./external-skill", "--no-snyk"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["skills", "inspect", ".threadroot/skills/package-smoke-skill"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  await run(bin, ["skills", "trust", "package-smoke-skill"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["skills", "expose", "package-smoke-skill", "--agent", "universal"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  await rm(externalSkillDir, { recursive: true, force: true });
  await run(bin, ["map", "--write"], { cwd: projectDir, env: { HOME: homeDir } });
  await run(bin, ["doctor"], { cwd: projectDir, env: { HOME: homeDir } });
} finally {
  if (tarballPath) {
    await rm(tarballPath, { force: true });
  }
  await rm(workDir, { recursive: true, force: true });
}
