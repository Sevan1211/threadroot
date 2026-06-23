# Release Checklist

Threadroot publishes as a local-first CLI package. The npm package intentionally ships only:

- `dist/`
- package metadata
- README, license, security, changelog, and integration docs

## Before publishing

```bash
git status
pnpm install --frozen-lockfile
pnpm release:check
npm view threadroot
```

If `npm view threadroot` returns package metadata, the unscoped package name is already taken. Rename the package or use a scope before publishing.

## Commit, push, and publish 0.2.1 manually

```bash
git status
git add .
git commit -m "Release threadroot 0.2.1"
git push origin HEAD
```

```bash
npm login
npm view threadroot version
npm pack --dry-run
npm publish --access public
```

If your npm account supports provenance for this publish path, prefer:

```bash
npm publish --access public --provenance
```

After publishing, create a GitHub release or tag:

```bash
git tag v0.2.1
git push origin v0.2.1
```

For a later automated release, prefer npm trusted publishing from a GitHub-hosted
Actions runner with `id-token: write` so npm can generate provenance without a
long-lived npm token.

## Verify after publish

```bash
npm view threadroot version
npm audit signatures
TMP_REPO="$(mktemp -d /tmp/threadroot-publish-smoke.XXXXXX)"
cd "$TMP_REPO"
npm exec threadroot -- --version
npm exec threadroot -- init --no-import --profile node-cli
npm exec threadroot -- connect codex --dry-run
npm exec threadroot -- task "smoke test repo context" --json
npm exec threadroot -- index --status --json
npm exec threadroot -- doctor
```

Expected doctor result after a minimal smoke may include optional index or MCP connection hints. It should not report harness errors.

## CI release gate

GitHub Actions runs typecheck, lint, tests, build, and the packed-package smoke test. Local releases should still run `pnpm release:check` immediately before publishing.
