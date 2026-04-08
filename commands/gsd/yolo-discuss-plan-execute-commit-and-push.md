---
name: gsd:yolo-discuss-plan-execute-commit-and-push
description: Chain yolo discuss, plan, execute, and strict git finalization. Single phase pushes after a clean pass; range mode delegates to autonomous yolo push-after-phase mode.
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
Run yolo discuss, plan, execute, and then finalize git only when verification is clean.

Single phase mode delegates to phase-level yolo discuss plus the existing auto-chain, then runs a strict commit/push gate.
Range mode delegates to `/gsd-autonomous --yolo --push-after-phase`.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/yolo-discuss-plan-execute-commit-and-push.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the yolo-discuss-plan-execute-commit-and-push workflow from @~/.claude/get-shit-done/workflows/yolo-discuss-plan-execute-commit-and-push.md end-to-end.
</process>

<success_criteria>
- Single-phase runs push only after a clean verification pass
- Multi-phase runs push after each cleanly completed phase
- No commit or push happens when verification is not clean
</success_criteria>
