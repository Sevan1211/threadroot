import type { SkillDefinition, SkillPack } from "../types.js";

function skill(input: SkillDefinition): SkillDefinition {
  return input;
}

export const skillPacks: SkillPack[] = [
  {
    id: "core-agentic",
    name: "Core Agentic Workflow",
    description: "Session start, planning, validation, refresh, and memory hygiene.",
    appliesTo: ["all"],
    skills: [
      skill({
        id: "core.start-session",
        slug: "start-session",
        category: "core",
        title: "Start Session",
        purpose: "Load the smallest useful repo memory before work starts.",
        triggers: ["start", "session", "continue", "handoff", "context"],
        appliesTo: ["all"],
        readFirst: [
          "threadroot/project.md",
          "threadroot/current-focus.md",
          "threadroot/handoff.md",
          "threadroot/commands.md",
          "threadroot/pitfalls.md",
        ],
        steps: [
          "Read current focus and latest handoff before planning.",
          "Check pitfalls for repo-specific traps.",
          "Run `threadroot skills suggest \"<task>\"` when the task type is unclear.",
          "Load only the skills and files needed for the current task.",
        ],
        validation: ["Confirm the next action in plain language before broad edits."],
        commonMistakes: ["Reading every skill file up front.", "Ignoring stale handoff context."],
      }),
      skill({
        id: "core.plan-feature",
        slug: "plan-feature",
        category: "core",
        title: "Plan Feature",
        purpose: "Create a focused implementation plan before meaningful changes.",
        triggers: ["feature", "plan", "implement", "build", "add"],
        appliesTo: ["all"],
        readFirst: ["threadroot/project.md", "threadroot/repo-map.md", "threadroot/commands.md"],
        steps: [
          "State the user-visible outcome.",
          "Identify likely code areas before editing.",
          "Pick the smallest relevant skill set.",
          "Define validation commands before implementation.",
        ],
        validation: ["Plan names affected areas and validation commands."],
        commonMistakes: ["Planning abstractions before locating existing patterns."],
      }),
      skill({
        id: "core.validate-change",
        slug: "validate-change",
        category: "core",
        title: "Validate Change",
        purpose: "Check a completed change before calling it done.",
        triggers: ["validate", "test", "done", "review", "finish"],
        appliesTo: ["all"],
        readFirst: ["threadroot/commands.md", "threadroot/pitfalls.md"],
        steps: [
          "Review changed files for scope creep.",
          "Run the most relevant validation command.",
          "If validation cannot run, explain the blocker and residual risk.",
          "Update memory only when durable project knowledge changed.",
        ],
        validation: ["Relevant test/lint/build command has been run or explicitly explained."],
        commonMistakes: ["Claiming success without validation.", "Updating memory with transient details."],
      }),
      skill({
        id: "core.update-memory",
        slug: "update-memory",
        category: "core",
        title: "Update Memory",
        purpose: "Preserve useful context across sessions and model switches.",
        triggers: ["memory", "handoff", "decision", "pitfall", "archive"],
        appliesTo: ["all"],
        readFirst: [
          "threadroot/current-focus.md",
          "threadroot/handoff.md",
          "threadroot/decisions.md",
          "threadroot/pitfalls.md",
        ],
        steps: [
          "Write only durable facts that help future sessions.",
          "Put next actions and blockers in handoff.",
          "Put tradeoffs in decisions.",
          "Put repeated mistakes or repo-specific traps in pitfalls.",
          "Archive stale session detail instead of deleting it.",
        ],
        validation: ["Memory files are shorter, clearer, and source-grounded."],
        commonMistakes: ["Pasting chat transcripts.", "Duplicating the same rule in several files."],
      }),
      skill({
        id: "core.debug-systematically",
        slug: "debug-systematically",
        category: "core",
        title: "Debug Systematically",
        purpose: "Reproduce, isolate, fix, and verify issues without thrashing.",
        triggers: ["bug", "debug", "error", "failing", "regression", "crash"],
        appliesTo: ["all"],
        readFirst: ["threadroot/commands.md", "threadroot/pitfalls.md", "threadroot/handoff.md"],
        steps: [
          "Reproduce the issue or identify why it cannot be reproduced.",
          "Find the smallest failing boundary.",
          "Change one hypothesis at a time.",
          "Add or update a regression test when practical.",
          "Run validation after the fix.",
        ],
        validation: ["The failing behavior is reproduced or bounded, then verified after the fix."],
        commonMistakes: ["Changing unrelated code while debugging.", "Stopping after symptoms disappear."],
      }),
    ],
  },
  {
    id: "web-ui",
    name: "Web UI",
    description: "Frontend architecture, design quality, accessibility, and responsive validation.",
    appliesTo: ["nextjs", "vite-react", "react", "vue", "svelte"],
    skills: [
      skill({
        id: "ui.implement-screen",
        slug: "implement-screen",
        category: "ui",
        title: "Implement Screen",
        purpose: "Build a polished, responsive UI screen that matches project patterns.",
        triggers: ["screen", "page", "component", "layout", "form", "dashboard", "ui"],
        appliesTo: ["nextjs", "vite-react", "react", "vue", "svelte"],
        readFirst: ["threadroot/project.md", "threadroot/architecture.md", "threadroot/commands.md"],
        steps: [
          "Find existing components and layout conventions before creating new primitives.",
          "Define empty, loading, error, and success states.",
          "Use semantic controls and accessible labels.",
          "Keep dense app surfaces practical and scannable.",
          "Verify responsive layout at mobile and desktop widths.",
        ],
        validation: ["Run UI lint/test commands.", "Manually inspect important responsive states when possible."],
        commonMistakes: ["Making a marketing hero when the task is an app surface.", "Using oversized text inside compact panels."],
      }),
      skill({
        id: "ui.review-ui",
        slug: "review-ui",
        category: "ui",
        title: "Review UI",
        purpose: "Review layout, interaction states, accessibility, and visual quality.",
        triggers: ["review", "polish", "accessibility", "responsive", "visual", "ux"],
        appliesTo: ["nextjs", "vite-react", "react", "vue", "svelte"],
        readFirst: ["threadroot/pitfalls.md", "threadroot/commands.md"],
        steps: [
          "Check text fit and overflow.",
          "Check hover/focus/disabled/loading states.",
          "Check keyboard navigation and labels.",
          "Check spacing and hierarchy against nearby UI.",
        ],
        validation: ["No obvious overlap, clipping, or inaccessible controls remain."],
        commonMistakes: ["Only checking the default desktop state."],
      }),
    ],
  },
  {
    id: "api-service",
    name: "API Service",
    description: "Backend boundaries, validation, errors, tests, and API contracts.",
    appliesTo: ["fastapi", "express", "django", "rails", "spring"],
    skills: [
      skill({
        id: "api.add-endpoint",
        slug: "add-endpoint",
        category: "api",
        title: "Add Endpoint",
        purpose: "Add or change an HTTP/API endpoint with clear validation and tests.",
        triggers: ["api", "endpoint", "route", "handler", "request", "response"],
        appliesTo: ["fastapi", "express", "django", "rails", "spring"],
        readFirst: ["threadroot/architecture.md", "threadroot/commands.md"],
        steps: [
          "Locate existing endpoint conventions.",
          "Define request, response, auth, and error behavior.",
          "Keep transport handlers thin.",
          "Put domain behavior in the existing service/domain layer.",
          "Add tests for success and important failure cases.",
        ],
        validation: ["Run API tests and lint/type checks."],
        commonMistakes: ["Putting business logic directly in route handlers.", "Returning inconsistent error shapes."],
      }),
      skill({
        id: "api.review-contract",
        slug: "review-api-contract",
        category: "api",
        title: "Review API Contract",
        purpose: "Check API request/response shape, auth, and failure modes.",
        triggers: ["contract", "schema", "auth", "validation", "error"],
        appliesTo: ["fastapi", "express", "django", "rails", "spring"],
        readFirst: ["threadroot/commands.md", "threadroot/pitfalls.md"],
        steps: [
          "Confirm required and optional fields.",
          "Check auth and permission behavior.",
          "Check error shape consistency.",
          "Check backward compatibility for public APIs.",
        ],
        validation: ["Contract-sensitive tests or docs are updated when behavior changes."],
        commonMistakes: ["Changing public behavior without noting the contract change."],
      }),
    ],
  },
  {
    id: "cli-tool",
    name: "CLI Tool",
    description: "Command UX, safe filesystem behavior, dry runs, and tests.",
    appliesTo: ["python-cli", "node-cli", "go-cli", "rust-cli", "cli-tool"],
    skills: [
      skill({
        id: "cli.design-command",
        slug: "design-command",
        category: "cli",
        title: "Design Command",
        purpose: "Design ergonomic command behavior, flags, output, and errors.",
        triggers: ["cli", "command", "flag", "option", "terminal"],
        appliesTo: ["python-cli", "node-cli", "go-cli", "rust-cli", "cli-tool"],
        readFirst: ["threadroot/project.md", "threadroot/commands.md"],
        steps: [
          "Make the default path safe and understandable.",
          "Separate preview/dry-run from write behavior.",
          "Use concise output with clear next actions.",
          "Provide flags for automation after interactive behavior works.",
        ],
        validation: ["Smoke-test command success, failure, and dry-run paths."],
        commonMistakes: ["Writing files before preview.", "Making output too noisy for agents to parse."],
      }),
      skill({
        id: "cli.safe-file-write",
        slug: "safe-file-write",
        category: "cli",
        title: "Safe File Write",
        purpose: "Protect user-owned files with previews, hashes, and explicit confirmation.",
        triggers: ["write", "overwrite", "file", "diff", "manifest", "dry-run"],
        appliesTo: ["python-cli", "node-cli", "go-cli", "rust-cli", "cli-tool"],
        readFirst: ["threadroot/pitfalls.md", "threadroot/commands.md"],
        steps: [
          "Classify files as create, unchanged, stale, or manual-edit.",
          "Show diffs for manual edits.",
          "Never overwrite user-owned files silently.",
          "Update manifests only for files actually written.",
        ],
        validation: ["Tests cover create, unchanged, stale, and manual-edit states."],
        commonMistakes: ["Updating metadata for skipped writes."],
      }),
    ],
  },
  {
    id: "data-dbt",
    name: "Data/dbt",
    description: "Model grain, lineage, tests, freshness, and documentation.",
    appliesTo: ["dbt", "sql", "analytics", "data-project"],
    skills: [
      skill({
        id: "data.add-dbt-model",
        slug: "add-dbt-model",
        category: "data",
        title: "Add dbt Model",
        purpose: "Add a dbt model with explicit grain, tests, docs, and lineage.",
        triggers: ["dbt", "model", "sql", "warehouse", "analytics", "lineage"],
        appliesTo: ["dbt", "sql", "analytics", "data-project"],
        readFirst: ["threadroot/project.md", "threadroot/commands.md", "threadroot/architecture.md"],
        steps: [
          "Identify source tables and model grain.",
          "Follow existing staging/intermediate/mart conventions.",
          "Add tests for uniqueness, not-null, relationships, and accepted values where relevant.",
          "Document important assumptions.",
        ],
        validation: ["Run `dbt compile`, targeted `dbt build`, or the project validation command."],
        commonMistakes: ["Adding a model without documenting grain.", "Skipping tests for business-critical assumptions."],
      }),
      skill({
        id: "data.validate-lineage",
        slug: "validate-lineage",
        category: "data",
        title: "Validate Lineage",
        purpose: "Check upstream assumptions and downstream impact for data changes.",
        triggers: ["lineage", "upstream", "downstream", "freshness", "data quality"],
        appliesTo: ["dbt", "sql", "analytics", "data-project"],
        readFirst: ["threadroot/sources.md", "threadroot/commands.md"],
        steps: [
          "Identify upstream dependencies.",
          "Identify downstream models, dashboards, or consumers.",
          "Check tests and freshness assumptions.",
          "Record changed assumptions in decisions or pitfalls.",
        ],
        validation: ["Lineage impact is documented and validated."],
        commonMistakes: ["Treating SQL changes as local when downstream consumers depend on them."],
      }),
    ],
  },
  {
    id: "mobile-app",
    name: "Mobile App",
    description: "Mobile UX flows, platform constraints, state, permissions, and release checks.",
    appliesTo: ["react-native", "expo", "swift", "kotlin", "flutter", "mobile-app"],
    skills: [
      skill({
        id: "mobile.plan-flow",
        slug: "plan-mobile-flow",
        category: "mobile",
        title: "Plan Mobile Flow",
        purpose: "Design platform-aware screens, permissions, offline states, and navigation.",
        triggers: ["mobile", "expo", "react native", "screen", "navigation", "permission"],
        appliesTo: ["react-native", "expo", "swift", "kotlin", "flutter", "mobile-app"],
        readFirst: ["threadroot/project.md", "threadroot/current-focus.md"],
        steps: [
          "Map the user flow before coding screens.",
          "Define loading, offline, denied-permission, and error states.",
          "Respect platform navigation and safe-area conventions.",
          "Keep state ownership clear.",
        ],
        validation: ["Check key flows on at least one target device/simulator when possible."],
        commonMistakes: ["Ignoring denied permissions or offline behavior."],
      }),
      skill({
        id: "mobile.review-release",
        slug: "review-mobile-release",
        category: "mobile",
        title: "Review Mobile Release",
        purpose: "Check permissions, device states, and release risk before shipping.",
        triggers: ["release", "permissions", "device", "store", "build"],
        appliesTo: ["react-native", "expo", "swift", "kotlin", "flutter", "mobile-app"],
        readFirst: ["threadroot/commands.md", "threadroot/pitfalls.md"],
        steps: [
          "Check permissions and platform configuration.",
          "Check loading/offline/error states.",
          "Run release/build validation.",
          "Document release blockers in handoff.",
        ],
        validation: ["Release checks and known risks are recorded."],
        commonMistakes: ["Testing only the happy path on one viewport/device."],
      }),
    ],
  },
  {
    id: "testing-quality",
    name: "Testing and Quality",
    description: "Test strategy, regressions, coverage, and validation commands.",
    appliesTo: ["all"],
    skills: [
      skill({
        id: "quality.choose-tests",
        slug: "choose-tests",
        category: "quality",
        title: "Choose Tests",
        purpose: "Pick the right validation level for the change.",
        triggers: ["test", "coverage", "unit", "integration", "e2e", "validation"],
        appliesTo: ["all"],
        readFirst: ["threadroot/commands.md", "threadroot/pitfalls.md"],
        steps: [
          "Classify risk and blast radius.",
          "Prefer the smallest test that catches the behavior.",
          "Broaden validation for shared contracts or user-facing workflows.",
          "Explain skipped validation clearly.",
        ],
        validation: ["Validation choice matches risk."],
        commonMistakes: ["Running broad tests without checking the specific changed behavior."],
      }),
    ],
  },
];

export function allSkills(packs = skillPacks): SkillDefinition[] {
  return packs.flatMap((pack) => pack.skills);
}

export function selectSkillPacks(appliesTo: string[]): SkillPack[] {
  const normalized = new Set(appliesTo.map((item) => item.toLowerCase()));
  return skillPacks.filter((pack) => pack.appliesTo.includes("all") || pack.appliesTo.some((item) => normalized.has(item)));
}

export function selectSkills(appliesTo: string[]): SkillDefinition[] {
  return allSkills(selectSkillPacks(appliesTo));
}

export function skillPath(skillDefinition: SkillDefinition): string {
  return `threadroot/skills/${skillDefinition.category}/${skillDefinition.slug}.md`;
}

const stopwords = new Set(["a", "an", "the", "add", "build", "make", "create", "new", "update", "change", "for", "to"]);

export function suggestSkills(task: string, skills: SkillDefinition[]): SkillDefinition[] {
  const terms = task
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .filter((term) => term && !stopwords.has(term));

  return skills
    .map((candidate) => {
      const triggers = candidate.triggers.join(" ").toLowerCase();
      const title = candidate.title.toLowerCase();
      const appliesTo = candidate.appliesTo.join(" ").toLowerCase();
      const purpose = candidate.purpose.toLowerCase();
      const score = terms.reduce((total, term) => {
        if (triggers.includes(term)) return total + 4;
        if (title.includes(term)) return total + 3;
        if (appliesTo.includes(term)) return total + 2;
        if (purpose.includes(term)) return total + 1;
        return total;
      }, 0);
      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, 5)
    .map((item) => item.candidate);
}
