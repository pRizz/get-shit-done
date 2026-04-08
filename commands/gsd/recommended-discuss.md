---
name: gsd:recommended-discuss
description: Gather recommended discuss answers for one phase, review them once in a consolidated summary, then write CONTEXT.md.
argument-hint: "<phase> [--text]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
---

<objective>
Run discuss-phase in recommended-review mode for a single phase.

This is a thin wrapper over `/gsd-discuss-phase --recommended`.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/recommended-discuss.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)
</context>

<process>
Execute the recommended-discuss workflow from @~/.claude/get-shit-done/workflows/recommended-discuss.md end-to-end.
</process>

<success_criteria>
- Recommended answers synthesized for the requested phase
- User sees one consolidated review before CONTEXT.md is written
- Wrapper delegates to the shared discuss-phase recommendation engine
</success_criteria>
