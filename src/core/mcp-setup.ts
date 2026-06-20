export type McpSetupAgent = "all" | "generic" | "codex" | "copilot" | "cursor" | "claude";

export type McpSetupInput = {
  repoRoot: string;
  agent?: string;
  executable?: string;
  scriptPath?: string;
};

export function mcpSetupGuide(input: McpSetupInput): string {
  const agent = parseAgent(input.agent);
  const command = input.executable ?? process.execPath;
  const scriptPath = input.scriptPath ?? process.argv[1] ?? "threadroot";
  const nodeConfig = {
    mcpServers: {
      threadroot: {
        command,
        args: [scriptPath, "mcp"],
        cwd: input.repoRoot,
      },
    },
  };
  const installedConfig = {
    mcpServers: {
      threadroot: {
        command: "threadroot",
        args: ["mcp"],
        cwd: input.repoRoot,
      },
    },
  };

  return `Threadroot MCP setup

Project root:
${input.repoRoot}

What "waiting" means:
MCP tools appear only after your coding-agent client is configured to launch this stdio server and the agent surface reloads or starts a new session.

Server command:
\`\`\`bash
threadroot mcp
\`\`\`

Source checkout fallback:
\`\`\`bash
${command} ${scriptPath} mcp
\`\`\`

Generic MCP JSON for installed Threadroot:
\`\`\`json
${JSON.stringify(installedConfig, null, 2)}
\`\`\`

Generic MCP JSON for this checkout:
\`\`\`json
${JSON.stringify(nodeConfig, null, 2)}
\`\`\`

Agent notes:
${agentNotes(agent)}

Pasteable agent bootstrap prompt:
\`\`\`text
${agentLaunchPrompt(input.repoRoot, `${command} ${scriptPath}`)}
\`\`\`
`;
}

export function agentLaunchPrompt(repoRoot: string, localCommand = "node /path/to/threadroot/dist/index.js"): string {
  return `You are setting up Threadroot in this repository.

Repository:
${repoRoot}

Goal:
Initialize Threadroot so this repo has portable AI-agent instructions, durable memory, curated skills, executable tools, and vendor-specific adapter files generated from one canonical harness.

Rules:
- Prefer deterministic CLI commands.
- Do not overwrite user-owned files without checking Threadroot status/diff.
- Keep context small. Use Threadroot context output before reading broad project files.

Steps:
1. Check whether Threadroot is available with \`threadroot --version\`.
2. If it is not available, try \`npm exec threadroot -- --help\` or \`pnpm dlx threadroot --help\`. If this is a local checkout, use \`${localCommand} --help\`.
3. Run \`threadroot status\` to check whether a harness already exists.
4. If no harness exists, run \`threadroot init\`. Use \`--no-import\` only when the user explicitly wants a blank-slate harness.
5. Run \`threadroot status\` again.
6. If status reports drift, run \`threadroot diff\` and summarize the drift before changing generated files.
7. Run \`threadroot context "current task"\` with the user's actual task to find relevant skills, rules, tools, and memory.
8. If project-local MCP config is useful, run \`threadroot mcp setup --write\` and tell the user to reload their agent surface.

Final response:
Say exactly:
"Success: Threadroot is initialized. Run \`threadroot status\` or \`threadroot context "<task>"\` to use it."

If using a local checkout instead of an installed package, say:
"Success: Threadroot is initialized. Run \`${localCommand} status\` or \`${localCommand} context "<task>"\` to use it."`;
}

function parseAgent(value: string | undefined): McpSetupAgent {
  if (value === "codex" || value === "copilot" || value === "cursor" || value === "claude" || value === "generic") {
    return value;
  }
  return "all";
}

function agentNotes(agent: McpSetupAgent): string {
  const generic = [
    "- Add an MCP server named `threadroot`.",
    "- Use command `threadroot` with args `[\"mcp\"]` when Threadroot is installed.",
    "- Use the source checkout fallback when testing this repo before publishing.",
    "- Set cwd to the project root, not to the Threadroot package source unless those are the same project.",
  ];
  const notes: Record<Exclude<McpSetupAgent, "all">, string[]> = {
    generic,
    codex: [
      ...generic,
      "- In Codex, configure the MCP server in the MCP/client configuration available to your Codex environment.",
      "- MCP tools will not appear inside an already-running session until that environment has loaded the server.",
    ],
    copilot: [
      ...generic,
      "- In VS Code/Copilot-capable MCP clients, add the JSON server config to the workspace or user MCP configuration.",
      "- Restart or reload the agent surface after adding the server.",
    ],
    cursor: [
      ...generic,
      "- In Cursor, add the JSON server config to Cursor's MCP settings for this project or user profile.",
      "- Reload the agent surface after saving the MCP config.",
    ],
    claude: [
      ...generic,
      "- In Claude MCP clients, add a local stdio server with command `threadroot` and args `[\"mcp\"]`.",
      "- Restart the client session after adding the server.",
    ],
  };

  if (agent === "all") {
    return [
      "Generic:",
      ...generic,
      "",
      "Codex:",
      ...notes.codex,
      "",
      "Copilot / VS Code:",
      ...notes.copilot,
      "",
      "Cursor:",
      ...notes.cursor,
      "",
      "Claude:",
      ...notes.claude,
    ].join("\n");
  }

  return notes[agent].join("\n");
}
