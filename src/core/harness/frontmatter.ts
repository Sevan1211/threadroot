import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Minimal YAML frontmatter handling for prose objects (skills, rules, memory).
 * A document is `---\n<yaml>\n---\n<body>`; files without a fence are all body.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export type ParsedDocument = {
  data: Record<string, unknown>;
  body: string;
};

export function parseFrontmatter(raw: string): ParsedDocument {
  const normalized = raw.replace(/^\uFEFF/, "");
  const match = FRONTMATTER_RE.exec(normalized);
  if (!match) {
    return { data: {}, body: normalized.trim() };
  }

  const parsed = parseYaml(match[1] ?? "") as unknown;
  const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return { data, body: (match[2] ?? "").trim() };
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const front = stringifyYaml(data).trimEnd();
  return `---\n${front}\n---\n\n${body.trim()}\n`;
}
