---
name: gsd:yolo-ralph
description: Loop fresh launcher-specific runs over the strict-push yolo wrapper until milestone phase work is exhausted or a blocker occurs.
argument-hint: "--agent-cli <selector> [--max-iterations N] [--sleep-seconds N] [--heartbeat-seconds N] [--stage-tick-seconds N]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

<objective>
Run a thin loop-driver wrapper over `gsd-tools.cjs yolo-ralph`.

This command does not implement milestone logic itself. It shells out to the real CLI subcommand, which requires `--agent-cli <selector>`, launches fresh runs of `$gsd-yolo-discuss-plan-execute-commit-and-push` through the selected launcher, tracks each iteration, and stops on milestone-end or the first failure.
</objective>

<execution-context>
@~/.claude/get-shit-done/workflows/yolo-ralph.md
</execution-context>

<context>
$ARGUMENTS
</context>

<process>
Execute the yolo-ralph workflow from @~/.claude/get-shit-done/workflows/yolo-ralph.md end-to-end.
</process>

<success-criteria>
- Delegates to the `gsd-tools.cjs yolo-ralph` CLI subcommand
- Requires explicit `--agent-cli <selector>` passthrough
- Preserves `--max-iterations` and `--sleep-seconds` flag passthrough
- Makes it clear this is a loop driver over the strict-push yolo wrapper
</success-criteria>
