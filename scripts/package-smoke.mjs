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

function tomlString(value) {
  return JSON.stringify(value);
}

async function assertNoLegacyState(projectDir) {
  if (existsSync(path.join(projectDir, ".threadroot"))) {
    throw new Error("Codex-native smoke must not create .threadroot/.");
  }
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
    throw new Error("Packed package must not include top-level skills/.");
  }
  if (existsSync(path.join(packageDir, "packs"))) {
    throw new Error("Packed package must not include packs/.");
  }
  const repoNodeModules = path.join(repoRoot, "node_modules");
  if (!existsSync(repoNodeModules)) {
    throw new Error("node_modules is required for package smoke. Run `pnpm install` first.");
  }
  await symlink(repoNodeModules, path.join(packageDir, "node_modules"), "dir");

  await mkdir(path.join(projectDir, "src"), { recursive: true });
  await mkdir(path.join(homeDir, ".codex"), { recursive: true });
  await writeFile(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "threadroot-package-smoke", scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2),
    "utf8",
  );
  await writeFile(path.join(projectDir, "src", "billing.ts"), "export function retryInvoice() { return 'billing'; }\n", "utf8");

  const bin = path.join(packageDir, "dist", "index.js");
  if (process.platform !== "win32") {
    const mode = (await stat(bin)).mode;
    if ((mode & 0o111) === 0) {
      throw new Error(`Packed CLI bin is not executable: ${bin}`);
    }
  }

  await writeFile(
    path.join(homeDir, ".codex", "config.toml"),
    [
      "[mcp_servers.threadroot]",
      `command = ${tomlString(process.execPath)}`,
      `args = [${[bin, "mcp"].map(tomlString).join(", ")}]`,
      "",
    ].join("\n"),
    "utf8",
  );

  const env = { HOME: homeDir };
  await runThreadroot(bin, ["--version"], { cwd: projectDir, env });
  await runThreadroot(bin, ["init", "--no-import", "--profile", "node-cli"], { cwd: projectDir, env });
  await assertNoLegacyState(projectDir);
  if (!existsSync(path.join(projectDir, "AGENTS.md"))) {
    throw new Error("threadroot init must create AGENTS.md guidance.");
  }
  if (!existsSync(path.join(projectDir, ".codex", "threadroot", "init.json"))) {
    throw new Error("threadroot init must write .codex/threadroot/init.json.");
  }

  await runThreadroot(bin, ["codex", "install", "--refresh-skill"], { cwd: projectDir, env });
  await assertNoLegacyState(projectDir);
  if (!existsSync(path.join(projectDir, ".codex", "threadroot", "install.json"))) {
    throw new Error("codex install must write .codex/threadroot/install.json.");
  }
  if (!existsSync(path.join(homeDir, ".agents", "skills", "threadroot", "SKILL.md"))) {
    throw new Error("--refresh-skill must write the global Codex skill under $HOME/.agents/skills.");
  }

  await runThreadroot(bin, ["codex", "status"], { cwd: projectDir, env });
  await runThreadroot(bin, ["prep", "fix retryInvoice billing", "--memory", "tiny"], { cwd: projectDir, env });
  await assertNoLegacyState(projectDir);

  const fakeCodex = path.join(projectDir, "fake-codex.mjs");
  await writeFile(
    fakeCodex,
    [
      "#!/usr/bin/env node",
      "process.stdin.resume();",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', () => {});",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'package smoke', exit_code: 0 } }));",
      "  console.log(JSON.stringify({ type: 'usage', usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 1 } }));",
      "});",
    ].join("\n"),
    "utf8",
  );
  if (process.platform !== "win32") {
    await chmod(fakeCodex, 0o755);
  }

  await runThreadroot(
    bin,
    ["codex", "run", "fix retryInvoice billing", "--memory", "tiny", "--codex-bin", fakeCodex, "--require", "node -e \"process.exit(0)\""],
    { cwd: projectDir, env },
  );
  await runThreadroot(bin, ["score", "latest"], { cwd: projectDir, env });
  await runThreadroot(bin, ["tune", "latest"], { cwd: projectDir, env });
  await runThreadroot(bin, ["eval", "codex"], { cwd: projectDir, env });
  await runThreadroot(bin, ["mcp", "check"], { cwd: projectDir, env });
  await runThreadroot(bin, ["codex", "doctor"], { cwd: projectDir, env });
  await assertNoLegacyState(projectDir);
} finally {
  if (tarballPath) {
    await rm(tarballPath, { force: true });
  }
  await rm(workDir, { recursive: true, force: true });
}
