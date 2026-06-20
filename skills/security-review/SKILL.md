---
name: security-review
description: Use when evaluating code, tools, scripts, install flows, MCP surfaces, auth, filesystem access, command execution, secrets, supply-chain risk, or user-controlled input for security issues.
scope: project
tags:
  - security
  - review
---

# Security Review

Focus on exploitable paths and trust boundaries.

## Workflow

1. Identify attacker-controlled inputs and privileged outputs.
2. Trace filesystem, network, shell, database, credential, and MCP/tool execution paths.
3. Look for path traversal, command injection, unsafe deserialization, auth bypass, secret exposure, SSRF, dependency risk, and confused-deputy behavior.
4. Verify allow-lists, confirmation prompts, provenance, integrity checks, and least privilege.
5. Recommend the smallest fix that closes the class of bug, plus a regression test.

## Output

Use severity labels. Distinguish confirmed vulnerabilities from hardening suggestions.
