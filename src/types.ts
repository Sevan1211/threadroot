import { z } from "zod";

export const profileIdSchema = z.enum([
  "nextjs",
  "vite-react",
  "fastapi",
  "python-cli",
  "node-cli",
  "dbt",
  "empty",
]);

export type ProfileId = z.infer<typeof profileIdSchema>;

export type ProjectCommand = {
  name: string;
  command: string;
  purpose: string;
};

export type ConfigSignal = {
  path: string;
  label: string;
  value: string;
};
