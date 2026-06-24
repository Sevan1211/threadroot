export const ignoredDirectories = new Set([
  ".git",
  ".codex",
  ".threadroot",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  "target",
  "dbt_packages",
  "__pycache__",
]);

export const configFiles = new Set([
  "package.json",
  "pyproject.toml",
  "dbt_project.yml",
  "dbt_project.yaml",
  "vite.config.ts",
  "vite.config.js",
  "next.config.ts",
  "next.config.js",
  "tsconfig.json",
]);
