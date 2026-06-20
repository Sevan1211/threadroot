import type { ToolManifest } from "../harness/index.js";

/** A resolved tool input value. */
export type InputValue = string | number | boolean;

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

const INPUT_TOKEN = /\{\{\s*([\w-]+)\s*\}\}/g;

/**
 * POSIX shell single-quote escaping. Wrapping an interpolated value makes it a
 * single shell word, so attacker-controlled input cannot break out of the
 * command (defense against command injection — OWASP A03).
 *
 * Note: this targets `/bin/sh`. Windows `cmd.exe` quoting differs; v1 assumes a
 * POSIX-like shell for `run` lines (the no-sandbox local trust model).
 */
export function shellQuote(value: string): string {
  if (value === "") {
    return "''";
  }
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function coerce(name: string, type: "string" | "number" | "boolean", raw: unknown): InputValue {
  if (type === "string") {
    if (typeof raw === "string") {
      return raw;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      return String(raw);
    }
    throw new ToolInputError(`Input \`${name}\` must be a string.`);
  }

  if (type === "number") {
    const value = typeof raw === "number" ? raw : Number(raw);
    if (typeof raw === "boolean" || Number.isNaN(value)) {
      throw new ToolInputError(`Input \`${name}\` must be a number.`);
    }
    return value;
  }

  // boolean
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new ToolInputError(`Input \`${name}\` must be a boolean.`);
}

/**
 * Validate + coerce the caller-provided inputs against the tool's declared
 * `input` schema, applying defaults. Unknown keys are rejected so typos fail
 * loudly rather than silently doing nothing.
 */
export function resolveInputs(
  manifest: ToolManifest,
  provided: Record<string, unknown> = {},
): Record<string, InputValue> {
  const declared = manifest.input ?? {};

  const unknown = Object.keys(provided).filter((key) => !(key in declared));
  if (unknown.length > 0) {
    throw new ToolInputError(`Unknown input(s) for \`${manifest.name}\`: ${unknown.join(", ")}.`);
  }

  const values: Record<string, InputValue> = {};
  const missing: string[] = [];

  for (const [name, param] of Object.entries(declared)) {
    if (name in provided && provided[name] !== undefined) {
      values[name] = coerce(name, param.type, provided[name]);
    } else if (param.default !== undefined) {
      values[name] = param.default;
    } else {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new ToolInputError(`Missing required input(s) for \`${manifest.name}\`: ${missing.join(", ")}.`);
  }

  return values;
}

/** Substitute `{{name}}` tokens in a `run` line with shell-quoted values. */
export function interpolateRun(run: string, values: Record<string, InputValue>): string {
  const result = run.replace(INPUT_TOKEN, (_match, name: string) => {
    if (!(name in values)) {
      throw new ToolInputError(`Command references undeclared input \`${name}\`.`);
    }
    return shellQuote(String(values[name]));
  });

  if (/\{\{|\}\}/.test(result)) {
    throw new ToolInputError("Command has malformed interpolation tokens.");
  }
  return result;
}

/** Expose resolved inputs to scripts as `TR_INPUT_<UPPER>` env vars + JSON. */
export function inputEnv(values: Record<string, InputValue>): Record<string, string> {
  const env: Record<string, string> = { TR_INPUT_JSON: JSON.stringify(values) };
  for (const [name, value] of Object.entries(values)) {
    env[`TR_INPUT_${name.toUpperCase().replace(/-/g, "_")}`] = String(value);
  }
  return env;
}
