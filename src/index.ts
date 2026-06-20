#!/usr/bin/env node
import { createProgram } from "./cli.js";

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] === "--") {
    return [argv[0] ?? "node", argv[1] ?? "threadroot", ...argv.slice(3)];
  }

  return argv;
}

createProgram()
  .parseAsync(normalizeArgv(process.argv))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
