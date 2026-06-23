#!/usr/bin/env node
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
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

await rm(path.join(process.cwd(), "dist"), { recursive: true, force: true });
await run(process.execPath, [path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json"]);
