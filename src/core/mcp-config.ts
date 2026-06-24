export type McpServerEntry = {
  command: string;
  args: string[];
};

/** Build the stdio server entry that launches `threadroot mcp`. */
export function mcpServerEntry(command: string, scriptPath?: string): McpServerEntry {
  return scriptPath ? { command, args: [scriptPath, "mcp"] } : { command, args: ["mcp"] };
}
