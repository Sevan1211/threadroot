import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { extractHandAuthored } from "../compile/managed.js";
import { parseFrontmatter } from "../harness/frontmatter.js";

/** Prose vendor files in canonical precedence order (spec §6.1). */
const PROSE_PRECEDENCE = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"] as const;

const CURSOR_RULES_DIR = ".cursor/rules";
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export type ImportedRule = {
  name: string;
  applyTo?: string;
  body: string;
};

export type ImportReport = {
  /** File chosen as the canonical prose source, if any. */
  canonicalSource?: string;
  /** Resulting hand-authored AGENTS.md body. */
  canonicalBody: string;
  /** Files whose novel sections were folded into the canonical body. */
  foldedFrom: string[];
  /** Rules mapped from Cursor `.mdc` frontmatter. */
  importedRules: ImportedRule[];
  /** Pure-duplicate files reported but not imported. */
  skippedDuplicates: string[];
};

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

type Section = { heading: string; text: string };

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      sections.push({ heading, text });
    }
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      heading = normalize(line.replace(/^#+\s*/, ""));
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** Sections of `other` whose content is not already present in `canonical`. */
function novelSections(canonical: string, other: string): Section[] {
  const haystack = normalize(canonical);
  const seenHeadings = new Set(splitSections(canonical).map((section) => section.heading).filter(Boolean));
  return splitSections(other).filter((section) => {
    if (section.heading && seenHeadings.has(section.heading)) {
      return false;
    }
    return !haystack.includes(normalize(section.text));
  });
}

async function listCursorRules(repoRoot: string): Promise<{ file: string; content: string }[]> {
  const dir = path.join(repoRoot, CURSOR_RULES_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files = entries.filter((name) => name.endsWith(".mdc")).sort();
  return Promise.all(
    files.map(async (name) => ({
      file: `${CURSOR_RULES_DIR}/${name}`,
      content: await readFile(path.join(dir, name), "utf8"),
    })),
  );
}

function globsToApplyTo(value: unknown): string | undefined {
  if (typeof value === "string") {
    const first = value.split(",")[0]?.trim();
    return first || undefined;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0].trim() || undefined;
  }
  return undefined;
}

function ruleName(fileName: string): string {
  const base = path
    .basename(fileName, ".mdc")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return NAME_RE.test(base) ? base : "imported-rule";
}

/**
 * Import existing vendor files into canonical prose once (spec §6.1, approach D):
 * pick one canonical source, fold in only novel sections from the rest, and map
 * Cursor `.mdc` rules structurally. Never invents skills/tools. Pure passthrough,
 * so the first compile reproduces essentially the same vendor content.
 */
export async function importVendorFiles(
  repoRoot: string,
  options: { include?: string[] } = {},
): Promise<ImportReport> {
  const include = options.include ? new Set(options.include) : undefined;
  const wanted = (file: string) => !include || include.has(file);

  const prose: { file: string; content: string }[] = [];
  for (const file of PROSE_PRECEDENCE) {
    if (!wanted(file)) {
      continue;
    }
    const content = await readIfExists(path.join(repoRoot, file));
    if (content && content.trim()) {
      prose.push({ file, content });
    }
  }

  const cursorRules = (await listCursorRules(repoRoot)).filter((rule) => wanted(rule.file));

  let canonicalSource: string | undefined;
  let canonicalBody = "";
  let rest: { file: string; content: string }[] = [];

  if (prose.length > 0) {
    canonicalSource = prose[0]!.file;
    canonicalBody = extractHandAuthored(prose[0]!.content);
    rest = prose.slice(1);
  } else if (cursorRules.length > 0) {
    canonicalSource = CURSOR_RULES_DIR;
    canonicalBody = cursorRules.map((rule) => parseFrontmatter(rule.content).body).join("\n\n").trim();
  }

  const foldedFrom: string[] = [];
  const skippedDuplicates: string[] = [];
  let body = canonicalBody;
  for (const file of rest) {
    const hand = extractHandAuthored(file.content);
    const novel = novelSections(body, hand);
    if (novel.length === 0) {
      skippedDuplicates.push(file.file);
      continue;
    }
    body = `${body}\n\n<!-- imported from ${file.file} -->\n${novel.map((section) => section.text).join("\n\n")}`.trim();
    foldedFrom.push(file.file);
  }

  const importedRules: ImportedRule[] = cursorRules.map((rule) => {
    const { data, body: ruleBody } = parseFrontmatter(rule.content);
    return {
      name: ruleName(rule.file),
      applyTo: globsToApplyTo(data.globs ?? data.applyTo),
      body: ruleBody.trim(),
    };
  });

  return { canonicalSource, canonicalBody: body, foldedFrom, importedRules, skippedDuplicates };
}
