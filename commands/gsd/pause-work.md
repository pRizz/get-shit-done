---
name: gsd:pause-work
description: Create context handoff when pausing work mid-phase
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Create `.continue-here.md` handoff file to preserve complete work state across sessions.

Routes to the pause-work workflow which handles:

- Current phase detection from recent files
- Complete state gathering (position, completed work, remaining work, decisions, blockers)
- Handoff file creation with all context sections
- Git commit as WIP
- Resume instructions
  </objective>

<execution-context>
@~/.claude/get-shit-done/workflows/pause-work.md
</execution-context>

<context>
State and phase progress are gathered in-workflow with targeted reads.
</context>

<process>
**Follow the pause-work workflow** from `@~/.claude/get-shit-done/workflows/pause-work.md`.

The workflow handles all logic including:

1. Phase directory detection
1. State gathering with user clarifications
1. Handoff file writing with timestamp
1. Git commit
1. Confirmation with resume instructions
   </process>
