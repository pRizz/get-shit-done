---
name: gsd:yolo-ralph
description: Loop fresh Codex runs over the strict-push yolo wrapper until milestone phase work is exhausted or a blocker occurs.
argument-hint: "[--max-iterations N] [--sleep-seconds N] [--heartbeat-seconds N] [--stage-tick-seconds N]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

<objective>
Run a thin loop-driver wrapper over `gsd-tools.cjs yolo-ralph`.

This command does not implement milestone logic itself. It shells out to the real CLI subcommand, which launches fresh Codex runs of `$gsd-yolo-discuss-plan-execute-commit-and-push`, tracks each iteration, and stops on milestone-end or the first failure.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/yolo-ralph.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the yolo-ralph workflow from @~/.claude/get-shit-done/workflows/yolo-ralph.md end-to-end.
</process>

<success_criteria>
- Delegates to the `gsd-tools.cjs yolo-ralph` CLI subcommand
- Preserves `--max-iterations` and `--sleep-seconds` flag passthrough
- Makes it clear this is a loop driver over the strict-push yolo wrapper
</success_criteria>
