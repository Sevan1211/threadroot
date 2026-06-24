#!/usr/bin/env node
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

function npmInvocation() {
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(npmCli)) {
    return { command: process.execPath, args: [npmCli] };
  }
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: [] };
}

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

function runThreadroot(bin, args, options = {}) {
  if (process.platform === "win32") {
    return run(process.execPath, [bin, ...args], options);
  }
  return run(bin, args, options);
}

function quotedNodeCommand(script) {
  return `"${process.execPath}" -e "${script.replace(/"/g, '\\"')}"`;
}

const workDir = await mkdtemp(path.join(tmpdir(), "threadroot-package-smoke."));
const cacheDir = path.join(workDir, "npm-cache");
let tarballPath;

try {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const baseName = String(pkg.name).replace(/^@/, "").replace(/\//g, "-");
  tarballPath = path.join(repoRoot, `${baseName}-${pkg.version}.tgz`);

  const npm = npmInvocation();
  await run(npm.command, [...npm.args, "--cache", cacheDir, "pack"]);
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
  if (process.platform !== "win32") {
    const mode = (await stat(bin)).mode;
    if ((mode & 0o111) === 0) {
      throw new Error(`Packed CLI bin is not executable: ${bin}`);
    }
  }
  await runThreadroot(bin, ["--version"], { cwd: projectDir });
  await runThreadroot(bin, ["init", "--no-import", "--profile", "node-cli"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["codex", "install"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["codex", "status"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["connections", "discover", "--include-missing"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["map", "--check"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["task", "write tests"], { cwd: projectDir, env: { HOME: homeDir } });
  const fakeCodex = path.join(projectDir, "fake-codex.mjs");
  await writeFile(
    fakeCodex,
    [
      "#!/usr/bin/env node",
      "process.stdin.resume();",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', () => {});",
      "process.stdin.on('end', () => console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'package smoke', exit_code: 0 } })));",
    ].join("\n"),
    "utf8",
  );
  if (process.platform !== "win32") {
    await chmod(fakeCodex, 0o755);
  }
  await runThreadroot(bin, ["loop", "start", "package smoke loop", "--max-iterations", "1"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  await runThreadroot(
    bin,
    [
      "loop",
      "run",
      "--iterations",
      "1",
      "--codex-bin",
      fakeCodex,
      "--require",
      quotedNodeCommand("process.exit(0)"),
      "--no-write-candidates",
    ],
    { cwd: projectDir, env: { HOME: homeDir } },
  );
  await runThreadroot(bin, ["loop", "report"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["loop", "finish"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["index", "--status"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["eval", "context"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["embeddings", "status"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["web", "status"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["skills", "validate"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["skills", "inspect", ".threadroot/skills/threadroot"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["skills", "inspect", ".threadroot/skills/find-skills"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["skills", "inspect", ".threadroot/skills/closing-loop-research"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["skills", "inspect", ".threadroot/skills/loop-automation-engineering"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["automation", "status"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["automation", "approve"], { cwd: projectDir, env: { HOME: homeDir } });
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
      "Validate the packaged skills ingest workflow.",
      "",
    ].join("\n"),
    "utf8",
  );
  await runThreadroot(bin, ["skills", "ingest", "./external-skill", "--dry-run", "--no-snyk"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  await runThreadroot(bin, ["skills", "ingest", "./external-skill", "--no-snyk"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["skills", "inspect", ".threadroot/skills/package-smoke-skill"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  await runThreadroot(bin, ["skills", "trust", "package-smoke-skill"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["memory", "gc"], { cwd: projectDir, env: { HOME: homeDir } });
  await rm(externalSkillDir, { recursive: true, force: true });
  await runThreadroot(bin, ["map", "--write"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["index"], { cwd: projectDir, env: { HOME: homeDir } });
  await runThreadroot(bin, ["doctor"], { cwd: projectDir, env: { HOME: homeDir } });
} finally {
  if (tarballPath) {
    await rm(tarballPath, { force: true });
  }
  await rm(workDir, { recursive: true, force: true });
}
