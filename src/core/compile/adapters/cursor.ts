import type { Adapter, CompiledFile, CompileContext } from "../types.js";
import { ruleBody, slug } from "./shared.js";

function mdcFile(name: string, applyTo: string, body: string): CompiledFile {
  const frontmatter = [
    "---",
    `description: ${name}`,
    `globs: ${applyTo}`,
    "alwaysApply: false",
    "---",
    "",
  ].join("\n");
  return { path: `.cursor/rules/${slug(name)}.mdc`, content: `${frontmatter}\n${body}\n` };
}

/**
 * Cursor reads AGENTS.md natively for the always-on base, and resolves
 * path-scoped rules from `.cursor/rules/*.mdc` (the `.mdc` extension is
 * required — plain `.md` is ignored).
 */
export const cursorAdapter: Adapter = {
  id: "cursor",
  compile(ctx: CompileContext): CompiledFile[] {
    const files: CompiledFile[] = [];

    for (const rule of ctx.scopedRules) {
      const applyTo = rule.frontmatter.applyTo;
      if (applyTo) {
        files.push(mdcFile(rule.name, applyTo, ruleBody(rule)));
      }
    }

    return files;
  },
};
