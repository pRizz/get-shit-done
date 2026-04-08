<purpose>
Run discuss-phase in recommended-review mode for a single phase.
</purpose>

<process>

<step name="validate_phase_arg">
Require a single phase number argument. If the first token in `$ARGUMENTS` is empty or starts with `--`, stop with:

```
Phase number required.

Usage: /gsd-recommended-discuss <phase> [--text]
```
</step>

<step name="delegate">
Delegate to the shared discuss workflow:

```bash
Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --recommended")
```

This wrapper adds no custom context logic — all behavior comes from the shared recommendation engine inside discuss-phase.
</step>

</process>

<success_criteria>
- Single-phase usage enforced
- Wrapper delegates to `/gsd-discuss-phase --recommended`
- Consolidated review behavior comes from the shared discuss workflow
</success_criteria>
