#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

function npmInvocation() {
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(npmCli)) {
    return { command: process.execPath, args: [npmCli] };
  }
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: [] };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

const cacheDir = await mkdtemp(path.join(tmpdir(), "threadroot-npm-cache."));

try {
  const npm = npmInvocation();
  await run(npm.command, [...npm.args, "--cache", cacheDir, "pack", "--dry-run"]);
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}
