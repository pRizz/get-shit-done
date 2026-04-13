<purpose>
Run yolo discuss plus plan and execute with minimal intervention.
</purpose>

<process>

<step name="route">
Detect whether the user requested a range run:

```bash
HAS_RANGE_FLAGS=""
if echo "$ARGUMENTS" | grep -qE '\-\-(from|to|only)\b'; then
  HAS_RANGE_FLAGS="true"
fi
```

**If `HAS_RANGE_FLAGS` is true:** continue to preview_range.

**If `HAS_RANGE_FLAGS` is empty:** continue to preview_single.
</step>

<step name="preview_single">
Resolve the target phase before delegating:

```bash
PHASE=$(echo "$ARGUMENTS" | awk '{print $1}')
AUTO_SELECTION_REASON=""
```

**If `PHASE` is empty:** resolve the wrapper target from shared CLI logic:

```bash
TARGET=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init yolo-target chain)
if [[ "$TARGET" == @file:* ]]; then TARGET=$(cat "${TARGET#@file:}"); fi
```

Parse from JSON: `error`, `selected_phase`, `selection_reason`, `nothing_to_do`.

**If `error` is non-empty:** stop with:

```
${error}
```

**If `nothing_to_do` is true:** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO PLAN EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Nothing to do.
 No incomplete phases match this run.
```

Exit without delegating.

**If a target phase was selected:** set:

```bash
PHASE="${selected_phase}"
AUTO_SELECTION_REASON="${selection_reason}"
```

Resolve the selected phase:

```bash
PHASE_STATE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$PHASE_STATE" == @file:* ]]; then PHASE_STATE=$(cat "${PHASE_STATE#@file:}"); fi
```

Parse from JSON: `phase_found`, `phase_number`, `phase_name`.

**If `phase_found` is false:** stop with:

```
Phase ${PHASE} not found in roadmap.

Use /gsd-progress to see available phases.
```

**If `phase_found` is true:** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO PLAN EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phase: ${phase_number} — ${phase_name}
 Steps: discuss → plan → execute
 Reason: ${AUTO_SELECTION_REASON}
```

Then delegate:

```bash
PHASE_LIFECYCLE_ID="${phase_number}-$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp filename)"
BASE_ARGS="${PHASE}"
```

```bash
Skill(skill="gsd-discuss-phase", args="${BASE_ARGS} --yolo --chain --lifecycle-id ${PHASE_LIFECYCLE_ID} --lifecycle-mode yolo")
```

Stop after delegation.

**If `PHASE` is non-empty:** resolve the requested phase before delegating:

```bash
PHASE_STATE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$PHASE_STATE" == @file:* ]]; then PHASE_STATE=$(cat "${PHASE_STATE#@file:}"); fi
```

Parse from JSON: `phase_found`, `phase_number`, `phase_name`.

**If `phase_found` is false:** stop with:

```
Phase ${PHASE} not found in roadmap.

Use /gsd-progress to see available phases.
```

**If `phase_found` is true:** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO PLAN EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phase: ${phase_number} — ${phase_name}
 Steps: discuss → plan → execute
```

Then delegate:

```bash
PHASE_LIFECYCLE_ID="${phase_number}-$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp filename)"
BASE_ARGS="$ARGUMENTS"
```

```bash
Skill(skill="gsd-discuss-phase", args="${BASE_ARGS} --yolo --chain --lifecycle-id ${PHASE_LIFECYCLE_ID} --lifecycle-mode yolo")
```
</step>

<step name="preview_range">
Load milestone context and the current roadmap just for the wrapper-level preview:

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init milestone-op)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
ROADMAP=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap analyze)
if [[ "$ROADMAP" == @file:* ]]; then ROADMAP=$(cat "${ROADMAP#@file:}"); fi
```

Parse from `INIT`: `milestone_version`, `milestone_name`, `phase_count`, `completed_phases`.

Parse from `ROADMAP`: `phases[]`.

Use the same filtering rules as `gsd-autonomous`:
- keep phases where `disk_status !== "complete"` OR `roadmap_complete === false`
- if `--from N` is present, filter out phases below N
- if `--to N` is present, filter out phases above N
- if `--only N` is present, keep only that phase

**If no phases remain after filtering:** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO PLAN EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Nothing to do.
 No remaining incomplete phases match this run.
```

Exit without delegating.

**If phases remain:** compute the first and last covered phases and display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO PLAN EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Milestone: ${milestone_version} — ${milestone_name}
 Phases: ${phase_count} total, ${completed_phases} complete
 This run will cover phases ${FIRST_PHASE} through ${LAST_PHASE}.
 Steps: discuss → plan → execute
```

Then delegate to autonomous yolo mode:

```bash
Skill(skill="gsd-autonomous", args="${ARGUMENTS} --yolo")
```

This wrapper does not add wrapper-level sub-agents because the delegated workflows already perform the agentized work.
</step>

</process>

<success_criteria>
- Explicit single-phase routing still uses `/gsd-discuss-phase --yolo --chain`
- No-argument routing auto-selects the current incomplete phase or next pending phase
- Auto-selected previews explain why the phase was chosen
- Range preview shows the covered phases and `discuss → plan → execute`
- Range mode exits early with a no-op message when no phases match
- Range routing uses `/gsd-autonomous --yolo`
- Existing plan/execute gates remain unchanged
</success_criteria>
