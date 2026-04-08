<purpose>
Run discuss-phase in yolo mode for a single phase.
</purpose>

<process>

<step name="validate_phase_arg">
Require a single phase number argument. If the first token in `$ARGUMENTS` is empty or starts with `--`, stop with:

```
Phase number required.

Usage: /gsd-yolo-discuss <phase>
```
</step>

<step name="preview">
Resolve the requested phase before delegating:

```bash
PHASE=$(echo "$ARGUMENTS" | awk '{print $1}')
PHASE_STATE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$PHASE_STATE" == @file:* ]]; then PHASE_STATE=$(cat "${PHASE_STATE#@file:}"); fi
```

Parse from JSON: `phase_found`, `phase_number`, `phase_name`.

**If `phase_found` is false:** stop with the same phase-not-found semantics used elsewhere:

```
Phase ${PHASE} not found in roadmap.

Use /gsd-progress to see available phases.
```

**If `phase_found` is true:** display a compact preview before delegation:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO DISCUSS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phase: ${phase_number} — ${phase_name}
 Steps: discuss
```
</step>

<step name="delegate">
Delegate to the shared discuss workflow:

```bash
Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo")
```

This wrapper adds no custom context logic — all behavior comes from the shared recommendation engine inside discuss-phase.
No wrapper-level sub-agent is needed because the downstream workflow already owns the substantive orchestration.
</step>

</process>

<success_criteria>
- Single-phase usage enforced
- Wrapper previews the phase and high-level steps before delegation
- Wrapper delegates to `/gsd-discuss-phase --yolo`
- Yolo behavior comes from the shared discuss workflow
</success_criteria>
