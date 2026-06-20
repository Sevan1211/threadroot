import type { ProfileId, ProjectProfile } from "../types.js";

export const profiles: Record<ProfileId, ProjectProfile> = {
  nextjs: {
    id: "nextjs",
    name: "Next.js App",
    description: "App Router web application with TypeScript-oriented defaults.",
    language: "TypeScript",
    framework: "Next.js",
    packageManager: "pnpm",
    commands: [
      { name: "dev", command: "pnpm dev", purpose: "Start the local development server." },
      { name: "build", command: "pnpm build", purpose: "Create a production build." },
      { name: "lint", command: "pnpm lint", purpose: "Run lint checks." },
      { name: "test", command: "pnpm test", purpose: "Run the test suite when configured." },
    ],
    vscodeExtensions: ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode", "bradlc.vscode-tailwindcss"],
    vscodeSettings: {
      "editor.formatOnSave": true,
      "typescript.tsdk": "node_modules/typescript/lib",
      "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    },
    gitignore: [".next/", "out/", "next-env.d.ts"],
    notes: ["Prefer server components by default.", "Keep client components small and explicit."],
  },
  "vite-react": {
    id: "vite-react",
    name: "Vite React App",
    description: "Fast React application profile for TypeScript frontends.",
    language: "TypeScript",
    framework: "Vite + React",
    packageManager: "pnpm",
    commands: [
      { name: "dev", command: "pnpm dev", purpose: "Start Vite." },
      { name: "build", command: "pnpm build", purpose: "Build static assets." },
      { name: "lint", command: "pnpm lint", purpose: "Run lint checks." },
      { name: "test", command: "pnpm test", purpose: "Run unit/component tests when configured." },
    ],
    vscodeExtensions: ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"],
    vscodeSettings: {
      "editor.formatOnSave": true,
      "typescript.tsdk": "node_modules/typescript/lib",
    },
    gitignore: ["dist/", "vite.config.*.timestamp-*"],
    notes: ["Keep reusable UI in `src/components`.", "Keep route/page state separate from shared components."],
  },
  fastapi: {
    id: "fastapi",
    name: "FastAPI Service",
    description: "Python API service profile with uv-oriented commands.",
    language: "Python",
    framework: "FastAPI",
    packageManager: "uv",
    commands: [
      { name: "dev", command: "uv run fastapi dev", purpose: "Run the API locally." },
      { name: "test", command: "uv run pytest", purpose: "Run tests." },
      { name: "lint", command: "uv run ruff check .", purpose: "Run Ruff checks." },
      { name: "format", command: "uv run ruff format .", purpose: "Format Python files." },
    ],
    vscodeExtensions: ["ms-python.python", "charliermarsh.ruff", "ms-python.vscode-pylance"],
    vscodeSettings: {
      "python.defaultInterpreterPath": ".venv/bin/python",
      "editor.formatOnSave": true,
      "python.analysis.typeCheckingMode": "basic",
    },
    gitignore: [".venv/", "__pycache__/", ".pytest_cache/", ".ruff_cache/"],
    notes: ["Keep route handlers thin.", "Put domain behavior outside HTTP handlers."],
  },
  "python-cli": {
    id: "python-cli",
    name: "Python CLI",
    description: "Python command-line project profile with uv and Typer-friendly defaults.",
    language: "Python",
    framework: "Typer / Click",
    packageManager: "uv",
    commands: [
      { name: "run", command: "uv run python -m app", purpose: "Run the CLI entrypoint." },
      { name: "test", command: "uv run pytest", purpose: "Run tests." },
      { name: "lint", command: "uv run ruff check .", purpose: "Run Ruff checks." },
      { name: "format", command: "uv run ruff format .", purpose: "Format Python files." },
    ],
    vscodeExtensions: ["ms-python.python", "charliermarsh.ruff", "ms-python.vscode-pylance"],
    vscodeSettings: {
      "python.defaultInterpreterPath": ".venv/bin/python",
      "editor.formatOnSave": true,
    },
    gitignore: [".venv/", "__pycache__/", ".pytest_cache/", ".ruff_cache/"],
    notes: ["Keep command parsing separate from business logic.", "Make commands easy to test without shelling out."],
  },
  dbt: {
    id: "dbt",
    name: "dbt Project",
    description: "Analytics engineering profile for dbt projects.",
    language: "SQL",
    framework: "dbt",
    packageManager: "dbt",
    commands: [
      { name: "deps", command: "dbt deps", purpose: "Install dbt packages." },
      { name: "compile", command: "dbt compile", purpose: "Compile models and macros." },
      { name: "test", command: "dbt test", purpose: "Run data tests." },
      { name: "build", command: "dbt build", purpose: "Build and test selected resources." },
    ],
    vscodeExtensions: ["innoverio.vscode-dbt-power-user", "ms-vscode.vscode-json"],
    vscodeSettings: {
      "files.associations": {
        "*.sql": "jinja-sql",
      },
      "editor.formatOnSave": true,
    },
    gitignore: ["target/", "dbt_packages/", "logs/"],
    notes: ["Document model grain and ownership.", "Prefer explicit tests for important assumptions."],
  },
  empty: {
    id: "empty",
    name: "Empty / Custom",
    description: "Minimal profile for deciding the stack later.",
    language: "Unspecified",
    framework: "Custom",
    packageManager: "Unspecified",
    commands: [
      { name: "validate", command: "echo \"Add validation command\"", purpose: "Placeholder validation command." },
    ],
    vscodeExtensions: [],
    vscodeSettings: {
      "editor.formatOnSave": true,
    },
    gitignore: [],
    notes: ["Update Threadroot context when the project stack is chosen."],
  },
};

export function getProfile(id: ProfileId): ProjectProfile {
  return profiles[id];
}

export function listProfiles(): ProjectProfile[] {
  return Object.values(profiles);
}

