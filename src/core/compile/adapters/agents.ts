import type { Adapter, CompiledFile, CompileContext } from "../types.js";

/**
 * AGENTS.md is the canonical, vendor-neutral hub. Codex, Copilot, and Cursor
 * read it natively; Claude imports it. The agents adapter simply writes the
 * composed canonical content (hand-authored prose + managed block).
 */
export const agentsAdapter: Adapter = {
  id: "agents",
  compile(ctx: CompileContext): CompiledFile[] {
    return [{ path: "AGENTS.md", content: ctx.canonicalAgents }];
  },
};
