import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { SourceCandidate } from "../types.js";

type RevampAppProps = {
  candidates: SourceCandidate[];
  onComplete: (selection: RevampSelection | undefined) => void;
};

export type RevampSelection = {
  candidates: SourceCandidate[];
  automationEnabled: boolean;
};

type Row = {
  key: string;
  label: string;
  type: "folder" | "file";
  candidate?: SourceCandidate;
};

function parentFolders(candidates: SourceCandidate[]): string[] {
  const folders = new Set<string>();
  for (const candidate of candidates) {
    const parts = candidate.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }
  return [...folders].sort();
}

function rowsFor(candidates: SourceCandidate[]): Row[] {
  const rows: Row[] = parentFolders(candidates).map((folder) => ({
    key: `folder:${folder}`,
    label: `${folder}/`,
    type: "folder",
  }));

  rows.push(
    ...candidates.map((candidate) => ({
      key: `file:${candidate.path}`,
      label: candidate.path,
      type: "file" as const,
      candidate,
    })),
  );

  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export function RevampApp({ candidates, onComplete }: RevampAppProps): JSX.Element {
  const { exit } = useApp();
  const rows = useMemo(() => rowsFor(candidates), [candidates]);
  const [cursor, setCursor] = useState(0);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [selected, setSelected] = useState(() => new Set(candidates.filter((item) => item.selected).map((item) => item.path)));

  function toggle(row: Row): void {
    if (row.type === "folder") {
      const prefix = row.label;
      const descendants = candidates.filter((candidate) => candidate.path.startsWith(prefix)).map((candidate) => candidate.path);
      const allSelected = descendants.every((item) => selected.has(item));
      setSelected((current) => {
        const next = new Set(current);
        for (const item of descendants) {
          if (allSelected) {
            next.delete(item);
          } else {
            next.add(item);
          }
        }
        return next;
      });
      return;
    }

    if (!row.candidate) {
      return;
    }

    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.candidate!.path)) {
        next.delete(row.candidate!.path);
      } else {
        next.add(row.candidate!.path);
      }
      return next;
    });
  }

  function finish(): void {
    onComplete({
      candidates: candidates.map((candidate) => ({ ...candidate, selected: selected.has(candidate.path) })),
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
    if (input === " ") {
      const row = rows[cursor];
      if (row) {
        toggle(row);
      }
      return;
    }
    if (input === "a") {
      setAutomationEnabled((current) => !current);
      return;
    }
    if (key.return) {
      finish();
    }
  });

  const current = rows[cursor];
  const selectedCount = selected.size;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>
        Threadroot Revamp
      </Text>
      <Text color="gray">Select old docs, agent files, and config files that should become project memory.</Text>
      <Box marginY={1} flexDirection="row">
        <Box width="65%" flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>Project Tree</Text>
          {rows.slice(Math.max(0, cursor - 8), cursor + 12).map((row) => {
            const active = row.key === current?.key;
            const checked =
              row.type === "folder"
                ? candidates.filter((candidate) => candidate.path.startsWith(row.label)).some((candidate) => selected.has(candidate.path))
                : Boolean(row.candidate && selected.has(row.candidate.path));
            return (
              <Text key={row.key} color={active ? "green" : undefined}>
                {active ? ">" : " "} {checked ? "[x]" : "[ ]"} {row.label}
                {row.candidate ? <Text color="gray"> - {row.candidate.reason}</Text> : null}
              </Text>
            );
          })}
        </Box>
        <Box width="35%" flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>Selection</Text>
          <Text>{selectedCount} source(s) selected</Text>
          <Text>Automation: {automationEnabled ? "enabled" : "suggested only"}</Text>
          {current?.candidate ? (
            <>
              <Text>Type: {current.candidate.kind}</Text>
              <Text>Score: {current.candidate.score}</Text>
              <Text color="gray">{current.candidate.reason}</Text>
            </>
          ) : (
            <Text color="gray">Folder selection includes relevant files inside it.</Text>
          )}
        </Box>
      </Box>
      <Text color="gray">Space selects. a toggles automation. Enter previews revamp. q exits.</Text>
    </Box>
  );
}
