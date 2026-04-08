---
name: gsd:yolo-discuss-plan-and-execute
description: Chain yolo discuss with planning and execution for one phase, or delegate range runs to autonomous yolo mode.
argument-hint: "<phase | --from N | --to N | --only N>"
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
Run yolo discuss followed by plan and execute with minimal intervention.

Single phase mode delegates to `/gsd-discuss-phase --yolo --chain`.
Range mode delegates to `/gsd-autonomous --yolo`.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/yolo-discuss-plan-and-execute.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the yolo-discuss-plan-and-execute workflow from @~/.claude/get-shit-done/workflows/yolo-discuss-plan-and-execute.md end-to-end.
</process>

<success_criteria>
- Single-phase runs use phase-level yolo discuss plus the existing auto-chain
- Multi-phase runs delegate to autonomous yolo mode
- Wrapper preserves the existing plan and execute gates
</success_criteria>
