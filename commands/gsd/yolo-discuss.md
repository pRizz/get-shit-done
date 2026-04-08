---
name: gsd:yolo-discuss
description: Gather recommended discuss answers for one phase and auto-accept them without pausing for approval.
argument-hint: "<phase>"
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
Run discuss-phase in yolo mode for a single phase.

This is a thin wrapper over `/gsd-discuss-phase --yolo`.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/yolo-discuss.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)
</context>

<process>
Execute the yolo-discuss workflow from @~/.claude/get-shit-done/workflows/yolo-discuss.md end-to-end.
</process>

<success_criteria>
- Recommended answers synthesized for the requested phase
- CONTEXT.md and DISCUSSION-LOG.md are written without an approval pause
- Wrapper delegates to the shared discuss-phase recommendation engine
</success_criteria>
