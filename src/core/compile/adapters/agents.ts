import type { Adapter, CompiledFile, CompileContext } from "../types.js";

/** AGENTS.md is the canonical Codex instruction surface. */
export const agentsAdapter: Adapter = {
  id: "agents",
  compile(ctx: CompileContext): CompiledFile[] {
    return [{ path: "AGENTS.md", content: ctx.canonicalAgents }];
  },
};
