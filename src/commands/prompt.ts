import { agentBootstrapPrompt, type AgentPromptTarget } from "../core/prompts/agents.js";
import { maintainPrompt } from "../core/prompts/maintain.js";
import { skillsPrompt } from "../core/prompts/skills.js";

export function runPromptSkills(): void {
  console.log(skillsPrompt());
}

export function runPromptAgent(target: AgentPromptTarget): void {
  console.log(agentBootstrapPrompt(target));
}

export function runPromptMaintain(): void {
  console.log(maintainPrompt());
}
