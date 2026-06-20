import type { CompileContext } from "./types.js";

const DEFAULT_PROJECT_BUDGET = 4000;

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max).trimEnd()}\n\n_(truncated to fit the memory budget)_`;
}

function skillsSection(ctx: CompileContext): string | undefined {
  if (ctx.skills.length === 0) {
    return undefined;
  }
  const lines = ctx.skills.map((skill) => `- **${skill.name}** — ${skill.frontmatter.when}`);
  return ["## Skills", "Available procedures (load the matching one when its trigger applies):", "", ...lines].join(
    "\n",
  );
}

function toolsSection(ctx: CompileContext): string | undefined {
  if (ctx.tools.length === 0) {
    return undefined;
  }
  const lines = ctx.tools.map((tool) => {
    const flags = [
      tool.manifest.risk !== "low" ? tool.manifest.risk : null,
      tool.manifest.confirm ? "asks before running" : null,
      tool.manifest.connection ? `connection: ${tool.manifest.connection}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const suffix = flags ? ` _(${flags})_` : "";
    return `- \`${tool.name}\` — ${tool.manifest.description}${suffix}`;
  });
  return [
    "## Tools",
    "Callable via the threadroot MCP server or `tr run <tool>`:",
    "",
    ...lines,
  ].join("\n");
}

function connectionsSection(ctx: CompileContext): string | undefined {
  if (ctx.connections.length === 0) {
    return undefined;
  }
  const lines = ctx.connections.map((connection) => {
    const flags = [
      connection.manifest.provider,
      connection.manifest.risk,
      connection.manifest.confirm ? "asks before running" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `- \`${connection.name}\` — ${connection.manifest.description} _(${flags})_`;
  });
  return [
    "## Connections",
    "Local CLI bridges available to connection-aware tools. Credentials stay in the user's local CLI configuration.",
    "",
    ...lines,
  ].join("\n");
}

function conventionsSection(ctx: CompileContext): string | undefined {
  if (ctx.globalRules.length === 0) {
    return undefined;
  }
  const blocks = ctx.globalRules.map((rule) => `### ${rule.name}\n\n${rule.body.trim()}`);
  return ["## Conventions", "", ...blocks].join("\n");
}

function referencesSection(ctx: CompileContext): string | undefined {
  if (ctx.references.length === 0) {
    return undefined;
  }

  const linked = ctx.references.filter((resolved) => !resolved.inlined);
  const inlined = ctx.references.filter((resolved) => resolved.inlined);

  const parts: string[] = ["## Additional context", "Existing project docs worth reading when relevant:"];

  if (linked.length > 0) {
    const lines = linked.map((resolved) => {
      const { reference } = resolved;
      const note = reference.description ? ` — ${reference.description}` : "";
      const missing = resolved.exists ? "" : " _(missing)_";
      return `- [${reference.path}](${reference.path})${note}${missing}`;
    });
    parts.push("", ...lines);
  }

  for (const resolved of inlined) {
    const note = resolved.reference.description ? `\n\n${resolved.reference.description}` : "";
    parts.push("", `### ${resolved.reference.path}${note}`, "", resolved.inlined!.trim());
  }

  return parts.join("\n");
}

function memorySection(ctx: CompileContext): string | undefined {
  const project = ctx.memory.find((entry) => entry.type === "project");
  const others = ctx.memory.filter((entry) => entry.type !== "project");
  if (!project && others.length === 0) {
    return undefined;
  }

  const parts: string[] = ["## Memory"];
  if (project) {
    const budget = ctx.manifest.memory.budget.project ?? DEFAULT_PROJECT_BUDGET;
    parts.push("", truncate(project.body.trim(), budget));
  }
  if (others.length > 0) {
    const links = [...new Set(others.map((entry) => entry.type))]
      .map((type) => `\`.threadroot/memory/${type}.md\``)
      .join(", ");
    parts.push("", `Task-scoped memory (loaded on demand): ${links}.`);
  }
  return parts.join("\n");
}

/** Render the full managed block injected into AGENTS.md (and mirrored files). */
export function buildManagedBlock(ctx: CompileContext): string {
  const sections = [
    skillsSection(ctx),
    toolsSection(ctx),
    connectionsSection(ctx),
    conventionsSection(ctx),
    referencesSection(ctx),
    memorySection(ctx),
  ].filter((section): section is string => Boolean(section));

  if (sections.length === 0) {
    return "_No threadroot-managed context yet. Add skills, tools, rules, or references._";
  }
  return sections.join("\n\n");
}
