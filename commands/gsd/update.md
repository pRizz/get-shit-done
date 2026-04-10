---
name: gsd:update
description: Update GSD from the fork source with commit and datetime preview
allowed-tools:
  - Bash
  - AskUserQuestion
---

<objective>
Check for GSD updates from the fork repo, install if available, and display the target commit details including its exact datetime.

Routes to the update workflow which handles:
- Version detection (local vs global installation)
- Fork ref resolution (`main` by default, or `--ref <sha-or-branch>`)
- Temporary fork clone and commit + datetime preview
- User confirmation with clean install warning
- Temp-checkout install execution and cache clearing
- Restart reminder
</objective>

<arguments>
Optional flags from `$ARGUMENTS`:
- `--ref <sha-or-branch>`: install from a specific fork branch or commit instead of the default `main`
</arguments>

<execution_context>
@~/.claude/get-shit-done/workflows/update.md
</execution_context>

<process>
**Follow the update workflow** from `@~/.claude/get-shit-done/workflows/update.md`.

The workflow handles all logic including:
1. Installed version detection (local/global)
2. Installed release metadata lookup from `RELEASE.json`
3. Fork ref resolution to an exact commit SHA
4. Commit + datetime preview or migration notice
5. Global-vs-local confirmation when a local install exists
6. Clean install warning display
7. Temp-checkout update execution
8. Cache clearing
</process>
