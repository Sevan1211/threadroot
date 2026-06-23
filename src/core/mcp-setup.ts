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
Make this repository ready for agent-assisted development with minimal project clutter.

Rules:
- Prefer deterministic CLI commands.
- Do not invent Threadroot commands.
- Keep context small. Use Threadroot context output before reading broad project files.
- Do not create provider-specific project files unless the user asks.
- ask before running commands that write visible provider files, mutate external services, or require risky local credentials.

Steps:
1. Check whether Threadroot is available with \`threadroot --version\`.
2. If it is not available, try \`npm exec threadroot -- --help\` or \`pnpm dlx threadroot --help\`. If this is a local checkout, use \`${localCommand} --help\`.
3. Run \`threadroot init\`. If this is a local checkout, run \`${localCommand} init\`.
4. Run \`threadroot connect <agent>\` for the provider the user is using. If this is a local checkout, run \`${localCommand} connect <agent>\`.
5. Run \`threadroot start "current task"\` with the user's actual task.
6. Run \`threadroot working-set "current task"\` before broad file reads.
7. If the repo map is missing or stale, run \`threadroot map --write\`, then re-run \`threadroot start "current task"\`.
8. If no installed skill fits the task, run \`threadroot skills find "<query>"\`. Install only through \`threadroot skills add <source> --skill <name>\`; inspect medium/high-risk or Snyk-warned skills with \`threadroot skills inspect .threadroot/skills/<name>\` before trusting them.
9. If no good external skill exists, use the \`create-skill\` seed skill and create a project-specific skill under \`.threadroot/skills/<name>/SKILL.md\`.
10. For repeatable repo commands, run \`threadroot tools detect\` and create minimal safe tools with \`threadroot tools create\`. For local services, create connections with \`threadroot connections add\`; never store secrets.
11. Before agent-created capabilities, check \`threadroot automation status\`. Ask the user to run \`threadroot automation approve\` only if they want safe low-risk capability creation for this project.
12. If the user explicitly asks for visible provider project files, use \`threadroot connect <agent> --project-files\`, \`threadroot expose <agent>\`, or \`threadroot skills expose <name|all> --agent <agent|universal|all>\`.

Final response:
Say exactly:
"Success: Threadroot is ready. Run \`threadroot start "<task>"\` for future sessions."

If using a local checkout instead of an installed package, say:
"Success: Threadroot is ready. Run \`${localCommand} start "<task>"\` for future sessions."`;
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
