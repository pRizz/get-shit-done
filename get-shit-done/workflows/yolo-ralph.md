<purpose>
Drive repeated fresh Codex runs of the strict-push yolo wrapper until phase work stops advancing, a blocker occurs, or milestone lifecycle work becomes the next step.
</purpose>

<process>

<step name="delegate_cli">
This workflow is intentionally thin. Shell out to the real CLI subcommand and stream its output:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" yolo-ralph $ARGUMENTS
```

The CLI subcommand owns:
- Codex preflight checks
- iteration looping and sleep behavior
- `.planning/tmp/yolo-ralph/` run logs
- stop-condition classification (`advanced`, `failed`, `stalled`, `needs_audit`, `milestone_done`)
</step>

</process>

<success_criteria>
- Workflow shells out directly to `gsd-tools.cjs yolo-ralph`
- No loop logic is duplicated in the workflow layer
- User sees the live iteration output from the CLI subcommand
</success_criteria>
