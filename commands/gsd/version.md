---
name: gsd:version
description: Show installed GSD version, commit, and commit date
allowed-tools:
  - Read
  - Bash
---

<objective>
Display the installed GSD version metadata for the invoking runtime.

The command reports:

- Installed version
- Release commit SHA
- Release commit date
- Detected runtime
- Install scope
  </objective>

<execution-context>
@~/.claude/get-shit-done/workflows/version.md
</execution-context>

<process>
**Follow the version workflow** from `@~/.claude/get-shit-done/workflows/version.md`.

The workflow handles all logic including:

1. Runtime-aware install detection
1. Installed version lookup
1. Release metadata lookup from local install files
1. Human-readable output formatting
   </process>
