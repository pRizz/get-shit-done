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

<execution_context>
@~/.claude/get-shit-done/workflows/version.md
</execution_context>

<process>
**Follow the version workflow** from `@~/.claude/get-shit-done/workflows/version.md`.

The workflow handles all logic including:
1. Runtime-aware install detection
2. Installed version lookup
3. Release metadata lookup from local install files
4. Human-readable output formatting
</process>
