import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";

export type MainMenuChoice = "start" | "revamp" | "doctor" | "refresh";

type MainMenuAppProps = {
  onComplete: (choice: MainMenuChoice | undefined) => void;
};

const choices: Array<{ value: MainMenuChoice; label: string; detail: string }> = [
  { value: "start", label: "Start new project", detail: "Create a new agent-ready project structure." },
  { value: "revamp", label: "Revamp existing project", detail: "Select old docs/config and generate Threadroot memory." },
  { value: "doctor", label: "Doctor", detail: "Check Threadroot setup health." },
  { value: "refresh", label: "Refresh", detail: "Regenerate agent/editor adapter files." },
];

export function MainMenuApp({ onComplete }: MainMenuAppProps): JSX.Element {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);

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
      setCursor((current) => Math.min(choices.length - 1, current + 1));
      return;
    }
    if (key.return) {
      onComplete(choices[cursor]?.value);
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>
        Threadroot
      </Text>
      <Text color="gray">Start or revive an agent-ready project.</Text>
      <Box marginY={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        {choices.map((choice, index) => (
          <Text key={choice.value} color={index === cursor ? "green" : undefined}>
            {index === cursor ? ">" : " "} {choice.label}
            <Text color="gray"> - {choice.detail}</Text>
          </Text>
        ))}
      </Box>
      <Text color="gray">Enter to choose. q exits.</Text>
    </Box>
  );
}
