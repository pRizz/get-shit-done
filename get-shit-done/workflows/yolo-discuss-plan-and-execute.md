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

**If `HAS_RANGE_FLAGS` is true:** delegate to autonomous yolo mode:

```bash
Skill(skill="gsd-autonomous", args="${ARGUMENTS} --yolo")
```

**If `HAS_RANGE_FLAGS` is empty:** treat this as a single-phase run and delegate to phase-level yolo discuss plus the existing auto-chain:

```bash
Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo --chain")
```
</step>

</process>

<success_criteria>
- Single-phase routing uses `/gsd-discuss-phase --yolo --chain`
- Range routing uses `/gsd-autonomous --yolo`
- Existing plan/execute gates remain unchanged
</success_criteria>
