import type {
  HarnessManifest,
  LoadedMemory,
  LoadedRule,
  LoadedSkill,
  LoadedTool,
  Reference,
} from "../harness/index.js";

/** A file produced by compilation, path relative to the repo root. */
export type CompiledFile = {
  path: string;
  content: string;
};

/** A reference resolved against the filesystem at compile time. */
export type ResolvedReference = {
  reference: Reference;
  exists: boolean;
  inlined?: string;
};

/** Everything an adapter needs to render its vendor outputs. */
export type CompileContext = {
  repoRoot: string;
  manifest: HarnessManifest;
  /** Hand-authored AGENTS.md prose (managed block stripped). */
  handAuthored: string;
  /** Full canonical AGENTS.md content (hand-authored + managed block). */
  canonicalAgents: string;
  skills: LoadedSkill[];
  /** Rules with no `applyTo` — always-on conventions. */
  globalRules: LoadedRule[];
  /** Rules scoped to a path glob via `applyTo`. */
  scopedRules: LoadedRule[];
  tools: LoadedTool[];
  memory: LoadedMemory[];
  references: ResolvedReference[];
};

export type Adapter = {
  id: string;
  compile(ctx: CompileContext): CompiledFile[];
};
