import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { listProfiles } from "../core/profiles.js";
import type { InitInput } from "../core/config.js";
import type { ProfileId, ProjectIntent, Strictness, Target } from "../types.js";

type InitAppProps = {
  projectName: string;
  onComplete: (input: InitInput | undefined) => void;
};

const targets: Target[] = ["codex", "copilot", "vscode"];
const strictnessValues: Strictness[] = ["light", "standard", "strict"];
const automationValues = [
  { value: false, label: "Suggested only", detail: "Agents can check upkeep guidance when useful." },
  { value: true, label: "Enabled", detail: "Agents should treat upkeep as expected project workflow." },
];
const intents: Array<{ value: ProjectIntent; label: string; detail: string }> = [
  { value: "portfolio", label: "Portfolio project", detail: "Reviewer-friendly docs, polish, and tradeoffs." },
  { value: "startup-prototype", label: "Startup prototype", detail: "Fast learning, assumptions, and product decisions." },
  { value: "saas-app", label: "SaaS app", detail: "Maintainable product flows and validation." },
  { value: "cli-tool", label: "CLI/dev tool", detail: "Command UX, safe writes, and examples." },
  { value: "api-service", label: "API service", detail: "Contracts, validation, and service boundaries." },
  { value: "data-project", label: "Data/dbt project", detail: "Lineage, grain, tests, and assumptions." },
  { value: "custom", label: "Custom", detail: "General repo-owned agent memory." },
];

export function InitApp({ projectName, onComplete }: InitAppProps): JSX.Element {
  const { exit } = useApp();
  const profiles = useMemo(() => listProfiles(), []);
  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [intent, setIntent] = useState<ProjectIntent>("portfolio");
  const [profile, setProfile] = useState<ProfileId>("nextjs");
  const [selectedTargets, setSelectedTargets] = useState<Target[]>(["codex", "copilot", "vscode"]);
  const [strictness, setStrictness] = useState<Strictness>("standard");
  const [automationEnabled, setAutomationEnabled] = useState(false);

  const rows =
    step === 0
      ? intents.map((item) => ({ label: item.label, value: item.value, detail: item.detail }))
      : step === 1
      ? profiles.map((item) => ({ label: item.name, value: item.id, detail: item.description }))
      : step === 2
        ? targets.map((item) => ({ label: item, value: item, detail: "Toggle with space." }))
        : step === 3
          ? strictnessValues.map((item) => ({ label: item, value: item, detail: "" }))
          : automationValues;

  function finish(): void {
    onComplete({
      profile,
      intent,
      projectName,
      targets: selectedTargets,
      strictness,
      automationEnabled,
    });
    exit();
  }

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onComplete(undefined);
      exit();
      return;
    }

    if (key.upArrow) {
      setCursor((current) => Math.max(0, current - 1));
      return;
    }

    if (key.downArrow) {
      setCursor((current) => Math.min(rows.length - 1, current + 1));
      return;
    }

    if (input === " " && step === 2) {
      const value = rows[cursor]?.value as Target;
      setSelectedTargets((current) =>
        current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      );
      return;
    }

    if (key.return) {
      if (step === 0) {
        setIntent(rows[cursor]?.value as ProjectIntent);
        setStep(1);
        setCursor(0);
        return;
      }

      if (step === 1) {
        setProfile(rows[cursor]?.value as ProfileId);
        setStep(2);
        setCursor(0);
        return;
      }

      if (step === 2) {
        if (selectedTargets.length === 0) {
          return;
        }
        setStep(3);
        setCursor(1);
        return;
      }

      if (step === 3) {
        setStrictness(rows[cursor]?.value as Strictness);
        setStep(4);
        setCursor(0);
        return;
      }

      if (step === 4) {
        setAutomationEnabled(Boolean(rows[cursor]?.value));
        setStep(5);
        return;
      }

      finish();
    }
  });

  const selectedProfile = profiles.find((item) => item.id === profile);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>
        Threadroot Init
      </Text>
      <Text color="gray">Create an AI-ready VS Code repo for Codex and Copilot.</Text>
      <Box marginY={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text>Project: {projectName}</Text>
        <Text>Intent: {intent}</Text>
        <Text>Profile: {selectedProfile?.name ?? profile}</Text>
        <Text>Targets: {selectedTargets.join(", ")}</Text>
        <Text>Strictness: {strictness}</Text>
        <Text>Automation: {automationEnabled ? "enabled" : "suggested only"}</Text>
      </Box>

      {step < 5 ? (
        <Box flexDirection="column">
          <Text bold>
            {step === 0
              ? "Choose project intent"
              : step === 1
                ? "Choose a tech profile"
                : step === 2
                  ? "Choose AI/editor targets"
                  : step === 3
                    ? "Choose strictness"
                    : "Choose automation mode"}
          </Text>
          {rows.map((row, index) => {
            const active = index === cursor;
            const checked = step === 2 && selectedTargets.includes(row.value as Target);
            return (
              <Text key={String(row.value)} color={active ? "green" : undefined}>
                {active ? ">" : " "} {step === 2 ? (checked ? "[x]" : "[ ]") : "   "} {row.label}
                {row.detail ? <Text color="gray"> - {row.detail}</Text> : null}
              </Text>
            );
          })}
          <Text color="gray">Enter to continue. Space toggles targets. q exits.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold>Preview</Text>
          <Text>Threadroot will create canonical context, Codex guidance, Copilot instructions, and VS Code files.</Text>
          <Text color="green">Press Enter to write files, or q to cancel.</Text>
        </Box>
      )}
    </Box>
  );
}
