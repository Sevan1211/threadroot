import type { LoadedConnection } from "../harness/index.js";

export type ConnectionPolicyDecision =
  | { allowed: true }
  | { allowed: false; message: string };

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function commandBody(command: string, connectionCommand: string): string {
  const normalized = normalize(command);
  const prefix = normalize(connectionCommand);
  if (normalized === prefix) {
    return "";
  }
  if (normalized.startsWith(`${prefix} `)) {
    return normalized.slice(prefix.length).trim();
  }
  return normalized;
}

function includesPattern(command: string, pattern: string): boolean {
  return command.includes(normalize(pattern));
}

export function authorizeConnectionCommand(
  connection: LoadedConnection,
  command: string | undefined,
): ConnectionPolicyDecision {
  const { allow, deny } = connection.manifest;
  if (allow.length === 0 && deny.length === 0) {
    return { allowed: true };
  }

  if (!command) {
    return {
      allowed: false,
      message: `Connection \`${connection.name}\` defines allow/deny rules, but this tool uses a script that Threadroot cannot policy-check. Use a shell \`run\` tool for connection-backed actions.`,
    };
  }

  const body = commandBody(command, connection.manifest.command);
  const full = normalize(command);
  const denied = deny.find((pattern) => includesPattern(body, pattern) || includesPattern(full, pattern));
  if (denied) {
    return {
      allowed: false,
      message: `Connection \`${connection.name}\` denies command fragment \`${denied}\`.`,
    };
  }

  if (allow.length > 0) {
    const allowed = allow.some((pattern) => includesPattern(body, pattern) || includesPattern(full, pattern));
    if (!allowed) {
      return {
        allowed: false,
        message: `Connection \`${connection.name}\` only allows: ${allow.map((pattern) => `\`${pattern}\``).join(", ")}.`,
      };
    }
  }

  return { allowed: true };
}
