import type { Adapter, CompiledFile, CompileContext } from "../types.js";
import { ruleBody, slug } from "./shared.js";

function claudeRoot(): string {
  const lines = [
    "# CLAUDE.md",
    "",
    "@AGENTS.md",
    "",
    "<!-- The shared harness lives in AGENTS.md (imported above). Claude-specific",
    "     guidance can be added below this comment; it is preserved across compiles. -->",
  ];
  return `${lines.join("\n")}\n`;
}

function ruleFile(name: string, applyTo: string, body: string): CompiledFile {
  const frontmatter = ["---", `name: ${name}`, "paths:", `  - "${applyTo}"`, "---", ""].join("\n");
  return { path: `.claude/rules/${slug(name)}.md`, content: `${frontmatter}\n${body}\n` };
}

function commandFile(name: string, description: string, run: string | undefined, script: string | undefined): CompiledFile {
  const frontmatter = ["---", `description: ${description}`, "---", ""].join("\n");
  const invocation = run
    ? `Run this shell command and report the result:\n\n\`\`\`sh\n${run}\n\`\`\``
    : `Run the script at \`.threadroot/tools/${script}\` and report the result.`;
  const body = [`# /${slug(name)}`, "", description, "", invocation].join("\n");
  return { path: `.claude/commands/${slug(name)}.md`, content: `${frontmatter}\n${body}\n` };
}

/**
 * Claude Code reads CLAUDE.md (not AGENTS.md), supports `@path` imports, and
 * resolves path-scoped rules from `.claude/rules/*.md` plus slash commands from
 * `.claude/commands/*.md`.
 */
export const claudeAdapter: Adapter = {
  id: "claude",
  compile(ctx: CompileContext): CompiledFile[] {
    const files: CompiledFile[] = [{ path: "CLAUDE.md", content: claudeRoot() }];

    for (const rule of ctx.scopedRules) {
      const applyTo = rule.frontmatter.applyTo;
      if (applyTo) {
        files.push(ruleFile(rule.name, applyTo, ruleBody(rule)));
      }
    }

    for (const tool of ctx.tools) {
      files.push(
        commandFile(tool.name, tool.manifest.description, tool.manifest.run, tool.manifest.script),
      );
    }

    return files;
  },
};
