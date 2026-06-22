import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SkillSearchCandidate = {
  name: string;
  source: string;
  url?: string;
  summary?: string;
  installCommand: string;
};

export type SkillSearchReport = {
  query: string;
  status: "ok" | "fallback";
  candidates: SkillSearchCandidate[];
  searchUrl: string;
  messages: string[];
  raw?: string;
};

export type SkillSearchOptions = {
  runner?: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

function skillsSearchUrl(query: string): string {
  return `https://www.skills.sh/search?q=${encodeURIComponent(query)}`;
}

function cleanSkillName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function parseSkillsShUrl(url: string): { source: string; name: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== "skills.sh" && parsed.hostname !== "www.skills.sh") {
    return undefined;
  }
  const [owner, repo, skill] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo || !skill) {
    return undefined;
  }
  return { source: `https://www.skills.sh/${owner}/${repo}/${skill}`, name: cleanSkillName(skill) };
}

function parseGithubSkillUrl(url: string): { source: string; name?: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    return undefined;
  }
  const [owner, repo, marker, ref, ...rest] = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (!owner || !repo) {
    return undefined;
  }
  const source = marker === "tree" && ref && rest.length > 0 ? `${owner}/${repo}/${rest.join("/")}` : `${owner}/${repo}`;
  const leaf = rest.at(-1);
  return { source, name: leaf ? cleanSkillName(leaf) : undefined };
}

function candidateFromSource(source: string, name: string, url?: string, summary?: string): SkillSearchCandidate {
  return {
    name,
    source,
    url,
    summary,
    installCommand: `threadroot skills add ${source} --skill ${name}`,
  };
}

export function parseSkillSearchOutput(query: string, stdout: string): SkillSearchCandidate[] {
  const candidates = new Map<string, SkillSearchCandidate>();
  const lines = stdout.split(/\r?\n/);
  const urlPattern = /https?:\/\/[^\s)>\]]+/g;

  for (const line of lines) {
    for (const [url] of line.matchAll(urlPattern)) {
      const cleaned = url.replace(/[.,;:]+$/, "");
      const skillsSh = parseSkillsShUrl(cleaned);
      if (skillsSh) {
        candidates.set(skillsSh.source, candidateFromSource(skillsSh.source, skillsSh.name, cleaned, line.trim()));
        continue;
      }
      const github = parseGithubSkillUrl(cleaned);
      if (github?.name) {
        candidates.set(github.source, candidateFromSource(github.source, github.name, cleaned, line.trim()));
      }
    }

    const command = line.match(/(?:npx\s+skills\s+add|skills\s+add)\s+(?<source>\S+)(?:\s+--skill\s+(?<skill>[a-z0-9-]+))?/i);
    if (command?.groups?.source) {
      const source = command.groups.source;
      const name = command.groups.skill ?? parseSkillsShUrl(source)?.name ?? parseGithubSkillUrl(source)?.name;
      if (name) {
        candidates.set(source, candidateFromSource(source, cleanSkillName(name), source, line.trim()));
      }
    }
  }

  if (candidates.size === 0) {
    const slug = cleanSkillName(query.split(/\s+/).slice(0, 5).join("-"));
    return [
      {
        name: slug || "task-specific-skill",
        source: skillsSearchUrl(query),
        url: skillsSearchUrl(query),
        summary: "Open skills.sh search results, choose a GitHub-backed skill, then install it through Threadroot.",
        installCommand: `threadroot skills add <github-or-skills.sh-source> --skill ${slug || "<skill-name>"}`,
      },
    ];
  }

  return [...candidates.values()].slice(0, 12);
}

export async function findSkills(query: string, options: SkillSearchOptions = {}): Promise<SkillSearchReport> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Skill search query is required.");
  }
  const runner =
    options.runner ??
    (async (command: string, args: string[]) => {
      const result = await execFileAsync(command, args, {
        timeout: options.timeoutMs ?? 10000,
        env: { ...process.env, ...options.env, DISABLE_TELEMETRY: "1" },
        maxBuffer: 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    });

  try {
    const result = await runner("npx", ["--yes", "skills", "find", trimmed]);
    const raw = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
    return {
      query: trimmed,
      status: "ok",
      candidates: parseSkillSearchOutput(trimmed, raw),
      searchUrl: skillsSearchUrl(trimmed),
      messages: [
        "Install only through Threadroot so skills are scanned, locked, and stored under .threadroot/skills/.",
      ],
      raw: raw.slice(0, 8000),
    };
  } catch (error) {
    return {
      query: trimmed,
      status: "fallback",
      candidates: parseSkillSearchOutput(trimmed, ""),
      searchUrl: skillsSearchUrl(trimmed),
      messages: [
        `Live skills search was unavailable: ${error instanceof Error ? error.message : String(error)}`,
        "Open the search URL or rerun when network access is available, then install GitHub-backed results through Threadroot.",
      ],
    };
  }
}
