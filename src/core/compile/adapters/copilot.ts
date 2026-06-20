import type { Adapter, CompiledFile, CompileContext } from "../types.js";
import { ruleBody, slug } from "./shared.js";

function instructionsFile(name: string, applyTo: string, body: string): CompiledFile {
  const frontmatter = ["---", `name: ${name}`, `applyTo: "${applyTo}"`, "---", ""].join("\n");
  return {
    path: `.github/instructions/${slug(name)}.instructions.md`,
    content: `${frontmatter}\n${body}\n`,
  };
}

/**
 * GitHub Copilot reads `.github/copilot-instructions.md` always-on (it also
 * understands AGENTS.md, but the dedicated file is the most portable default)
 * and path-scoped `*.instructions.md` files with an `applyTo` glob.
 */
export const copilotAdapter: Adapter = {
  id: "copilot",
  compile(ctx: CompileContext): CompiledFile[] {
    const files: CompiledFile[] = [
      { path: ".github/copilot-instructions.md", content: ctx.canonicalAgents },
    ];

    for (const rule of ctx.scopedRules) {
      const applyTo = rule.frontmatter.applyTo;
      if (applyTo) {
        files.push(instructionsFile(rule.name, applyTo, ruleBody(rule)));
      }
    }

    return files;
  },
};
