<purpose>
Run yolo discuss, plan, execute, commit, and push for all remaining incomplete phases in the current milestone.
</purpose>

<process>

<step name="validate_no_args">
This wrapper is a strict no-argument alias.

If `$ARGUMENTS` contains any non-whitespace content, stop with:

```
This command does not accept arguments.

Usage: /gsd-yolo-discuss-plan-execute-commit-and-push-all

For ranged or single-phase runs, use:
- /gsd-yolo-discuss-plan-execute-commit-and-push <phase>
- /gsd-yolo-discuss-plan-execute-commit-and-push --from N --to N
- /gsd-autonomous --yolo --push-after-phase
```
</step>

<step name="delegate">
Delegate directly to the existing autonomous strict-push flow:

```bash
Skill(skill="gsd-autonomous", args="--yolo --push-after-phase")
```

This wrapper adds no planning, execution, or git logic of its own.
</step>

</process>

<success_criteria>
- Unexpected arguments are rejected
- Workflow delegates exactly to `gsd-autonomous --yolo --push-after-phase`
- Semantics stay aligned with the current milestone autonomous flow
</success_criteria>
