---
name: gsd:yolo-discuss
description: Gather recommended discuss answers for one phase and auto-accept them without pausing for approval. Thin wrapper; relies on downstream discuss-phase orchestration.
argument-hint: "[phase]"
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
Run discuss-phase in yolo mode for a single phase, or auto-select the next appropriate phase when no phase is provided.

This is a thin wrapper over `/gsd-discuss-phase --yolo`.
No wrapper-level sub-agent is needed because `gsd-discuss-phase` owns the real orchestration.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/yolo-discuss.md
</execution_context>

<context>
Phase number: $ARGUMENTS (optional)
</context>

<process>
Execute the yolo-discuss workflow from @~/.claude/get-shit-done/workflows/yolo-discuss.md end-to-end.
</process>

<success_criteria>
- Recommended answers synthesized for the selected phase
- CONTEXT.md and DISCUSSION-LOG.md are written without an approval pause
- Wrapper delegates to the shared discuss-phase recommendation engine
</success_criteria>
