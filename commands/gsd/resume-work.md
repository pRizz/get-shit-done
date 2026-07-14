---
name: gsd:resume-work
description: Resume work from previous session with full context restoration
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - SlashCommand
---

<objective>
Restore complete project context and resume work seamlessly from previous session.

Routes to the resume-project workflow which handles:

- STATE.md loading (or reconstruction if missing)
- Checkpoint detection (.continue-here files)
- Incomplete work detection (PLAN without SUMMARY)
- Status presentation
- Context-aware next action routing
  </objective>

<execution-context>
@~/.claude/get-shit-done/workflows/resume-project.md
</execution-context>

<process>
**Follow the resume-project workflow** from `@~/.claude/get-shit-done/workflows/resume-project.md`.

The workflow handles all resumption logic including:

1. Project existence verification
1. STATE.md loading or reconstruction
1. Checkpoint and incomplete work detection
1. Visual status presentation
1. Context-aware option offering (checks CONTEXT.md before suggesting plan vs discuss)
1. Routing to appropriate next command
1. Session continuity updates
   </process>
