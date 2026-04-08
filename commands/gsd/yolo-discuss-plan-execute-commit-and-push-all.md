---
name: gsd:yolo-discuss-plan-execute-commit-and-push-all
description: Run yolo discuss, plan, execute, commit, and push for all remaining phases in the current milestone. This is a no-argument alias for autonomous yolo strict-push mode and should stay declarative.
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
Run yolo discuss, plan, execute, commit, and push for all remaining incomplete phases in the current active milestone.

This is a strict no-argument convenience alias for:
`/gsd-autonomous --yolo --push-after-phase`

No wrapper-level sub-agent is needed because this command is only a declarative alias over autonomous yolo strict-push mode.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/yolo-discuss-plan-execute-commit-and-push-all.md
</execution_context>

<context>
This command does not accept arguments.
</context>

<process>
Execute the yolo-discuss-plan-execute-commit-and-push-all workflow from @~/.claude/get-shit-done/workflows/yolo-discuss-plan-execute-commit-and-push-all.md end-to-end.
</process>

<success_criteria>
- Rejects unexpected arguments with a clear usage message
- Delegates directly to autonomous yolo strict-push mode
- Adds no new execution semantics beyond the existing autonomous flow
</success_criteria>
