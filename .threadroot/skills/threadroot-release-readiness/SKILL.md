---
name: threadroot-release-readiness
description: Use when preparing a Threadroot npm release, changing package contents, bumping versions, updating changelog/docs, or validating the publish artifact.
license: MIT
compatibility: npm package releases for Threadroot.
tags:
  - release
  - npm
  - package
  - verification
---

# Threadroot Release Readiness

Use this skill before publishing or when a change affects package contents, install behavior, or release contracts.

## Checklist

1. Confirm version alignment:
   - `package.json`
   - `src/core/version.ts`
   - changelog entry
   - docs or prompts that pin examples

2. Confirm package contents:

```bash
threadroot run pack-check
```

The npm tarball should ship only what users need. Avoid accidental source assets, temp folders, provider folders, `.threadroot/`, or old generated artifacts unless intentionally part of the package.

3. Run the full release gate only with explicit user approval:

```bash
threadroot run release-check --yes
```

4. After publish, verify registry state:

```bash
npm view threadroot@<version> version bin dist.tarball
npx --yes --package=threadroot@<version> -- threadroot --version
```

5. Test from outside the source repo when checking `npx`; local package context can shadow published bin resolution inside this repo.

## Release Notes

- Mention user-visible command changes.
- Mention MCP/tool changes.
- Mention security or trust-model changes.
- Mention any migration behavior.

## Safety

- Do not publish with dirty unrelated changes.
- Do not publish if `threadroot doctor` reports errors.
- High-risk release tools require confirmation by design.
