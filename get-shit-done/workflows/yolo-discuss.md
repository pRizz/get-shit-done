<purpose>
Run discuss-phase in yolo mode for a single phase, or auto-select the next appropriate phase when no phase is provided.
</purpose>

<process>

<step name="resolve_phase">
Resolve the target phase before delegating.

```bash
PHASE=$(echo "$ARGUMENTS" | awk '{print $1}')
AUTO_SELECTED=""
AUTO_SELECTION_REASON=""
```

**If `PHASE` is non-empty and starts with `--`:** stop with:

```
Unsupported arguments.

Usage: /gsd-yolo-discuss [phase]
```

**If `PHASE` is empty:** continue to auto_select.

**If `PHASE` is non-empty:** continue to load_phase.
</step>

<step name="auto_select">
Resolve the wrapper target from shared CLI logic:

```bash
TARGET=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init yolo-target discuss)
if [[ "$TARGET" == @file:* ]]; then TARGET=$(cat "${TARGET#@file:}"); fi
```

Parse from JSON: `error`, `selected_phase`, `selected_phase_name`, `selection_reason`, `requires_confirmation`, `alternative_phase`, `nothing_to_do`.

**If `error` is non-empty:** stop with:

```
${error}
```

**If `nothing_to_do` is true:** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO DISCUSS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Nothing to do.
 No incomplete phases need yolo discussion right now.
```

Exit without delegating.

**If `requires_confirmation` is true and `alternative_phase.number` exists:** ask via AskUserQuestion:

```
Header: Planned Phase
Question: Phase ${selected_phase} — ${selected_phase_name} already has plans. What should /gsd-yolo-discuss do?
Options:
- Discuss current phase (Recommended) — reopen discussion for the already-planned phase
- Switch to next pending phase — use ${alternative_phase.number} — ${alternative_phase.name} instead
- Cancel — stop without making changes
```

Branch on the answer:
- `Discuss current phase` → `PHASE="${selected_phase}"`, `AUTO_SELECTION_REASON="${selection_reason}"`
- `Switch to next pending phase` → `PHASE="${alternative_phase.number}"`, `AUTO_SELECTION_REASON="${alternative_phase.selection_reason}"`
- `Cancel` → stop with `Cancelled.`

**If `requires_confirmation` is true and `alternative_phase.number` is empty:** ask via AskUserQuestion:

```
Header: Planned Phase
Question: Phase ${selected_phase} — ${selected_phase_name} already has plans. Do you still want to run /gsd-yolo-discuss on it?
Options:
- Discuss current phase (Recommended) — reopen discussion for the already-planned phase
- Cancel — stop without making changes
```

Branch on the answer:
- `Discuss current phase` → `PHASE="${selected_phase}"`, `AUTO_SELECTION_REASON="${selection_reason}"`
- `Cancel` → stop with `Cancelled.`

**If `requires_confirmation` is false:** set:

```bash
PHASE="${selected_phase}"
AUTO_SELECTION_REASON="${selection_reason}"
AUTO_SELECTED="true"
```

Then continue to load_phase.
</step>

<step name="load_phase">
Resolve the selected phase before previewing:

```bash
PHASE_STATE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$PHASE_STATE" == @file:* ]]; then PHASE_STATE=$(cat "${PHASE_STATE#@file:}"); fi
```

Parse from JSON: `phase_found`, `phase_number`, `phase_name`.

**If `phase_found` is false:** stop with the same phase-not-found semantics used elsewhere:

```
Phase ${PHASE} not found in roadmap.

Use /gsd-progress to see available phases.
```
</step>

<step name="preview">
Display a compact preview before delegation:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO DISCUSS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phase: ${phase_number} — ${phase_name}
 Steps: discuss
```

**If `AUTO_SELECTION_REASON` is non-empty:** also display:

```
 Reason: ${AUTO_SELECTION_REASON}
```
</step>

<step name="delegate">
Delegate to the shared discuss workflow:

```bash
BASE_ARGS="$ARGUMENTS"
if [ -z "$BASE_ARGS" ]; then
  BASE_ARGS="${PHASE}"
fi
```

```bash
Skill(skill="gsd-discuss-phase", args="${BASE_ARGS} --yolo")
```

This wrapper adds no custom context logic — all behavior comes from the shared recommendation engine inside discuss-phase.
No wrapper-level sub-agent is needed because the downstream workflow already owns the substantive orchestration.
</step>

</process>

<success_criteria>
- Explicit single-phase usage still works unchanged
- No-argument usage auto-selects the next appropriate phase
- Auto-selected discuss runs stop for confirmation when the current phase already has plans
- Wrapper previews the phase and high-level steps before delegation
- Wrapper delegates to `/gsd-discuss-phase --yolo`
- Yolo behavior comes from the shared discuss workflow
</success_criteria>
