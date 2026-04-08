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

<step name="preview_remaining">
Load milestone context and the current roadmap just for the wrapper-level preview:

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init milestone-op)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
ROADMAP=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap analyze)
if [[ "$ROADMAP" == @file:* ]]; then ROADMAP=$(cat "${ROADMAP#@file:}"); fi
```

Parse from `INIT`: `milestone_version`, `milestone_name`, `phase_count`, `completed_phases`.

Parse from `ROADMAP`: `phases[]`.

Use the same filtering rules as `gsd-autonomous` for all remaining work:
- keep phases where `disk_status !== "complete"` OR `roadmap_complete === false`

**If no phases remain after filtering:** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO ALL PUSH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Nothing to do.
 No remaining incomplete phases are left in the current milestone.
```

Exit without delegating.

**If phases remain:** compute the first and last covered phases and display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO ALL PUSH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Milestone: ${milestone_version} — ${milestone_name}
 Phases: ${phase_count} total, ${completed_phases} complete
 This run will cover phases ${FIRST_PHASE} through ${LAST_PHASE}.
 Steps: discuss → plan → execute → commit/push
 Note: commit/push only happens after clean verification and the run stops on non-clean outcomes.
```
</step>

<step name="delegate">
Delegate directly to the existing autonomous strict-push flow after the wrapper-level preview:

```bash
Skill(skill="gsd-autonomous", args="--yolo --push-after-phase")
```

This wrapper adds no planning, execution, or git logic of its own.
</step>

</process>

<success_criteria>
- Unexpected arguments are rejected
- Wrapper previews the remaining phase range and `discuss → plan → execute → commit/push`
- Wrapper exits early with a no-op message when no phases remain
- Workflow delegates exactly to `gsd-autonomous --yolo --push-after-phase`
- Semantics stay aligned with the current milestone autonomous flow
</success_criteria>
