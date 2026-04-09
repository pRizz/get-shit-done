<purpose>
Run yolo discuss, plan, execute, and then finalize git only after a clean verification pass.
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
Resolve the requested phase before delegating:

```bash
PHASE=$(echo "$ARGUMENTS" | awk '{print $1}')
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
 GSD ► YOLO PLAN EXECUTE PUSH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phase: ${phase_number} — ${phase_name}
 Steps: discuss → plan → execute → commit/push
 Note: commit/push only happens after clean verification.
```

Run single-phase yolo discuss plus the existing auto-chain:

```bash
PHASE_LIFECYCLE_ID="${phase_number}-$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp filename)"
```

```bash
Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo --chain --lifecycle-id ${PHASE_LIFECYCLE_ID} --lifecycle-mode yolo")
```
Then continue to inspect_single_phase_result.
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
 GSD ► YOLO PLAN EXECUTE PUSH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Nothing to do.
 No remaining incomplete phases match this run.
```

Exit without delegating.

**If phases remain:** compute the first and last covered phases and display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► YOLO PLAN EXECUTE PUSH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Milestone: ${milestone_version} — ${milestone_name}
 Phases: ${phase_count} total, ${completed_phases} complete
 This run will cover phases ${FIRST_PHASE} through ${LAST_PHASE}.
 Steps: discuss → plan → execute → commit/push
 Note: commit/push only happens after clean verification and the run stops on non-clean outcomes.
```

Then delegate to autonomous strict-push mode:

```bash
Skill(skill="gsd-autonomous", args="${ARGUMENTS} --yolo --push-after-phase")
```

Then stop — autonomous owns the per-phase git finalization in range mode.

This wrapper does not add wrapper-level sub-agents because delegated workflows already own the heavy orchestration, and git finalization should stay inline.
</step>

<step name="inspect_single_phase_result">
After the chain returns, inspect the phase verification result:

```bash
PHASE=$(echo "$ARGUMENTS" | awk '{print $1}')
PHASE_STATE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$PHASE_STATE" == @file:* ]]; then PHASE_STATE=$(cat "${PHASE_STATE#@file:}"); fi
```

Parse from JSON: `phase_dir`, `phase_number`, `phase_name`, `padded_phase`.

```bash
VERIFY_STATUS=$(grep "^status:" "${phase_dir}"/*-VERIFICATION.md 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
```

**If `VERIFY_STATUS` is not `passed`:**

Display:
```
Phase ${PHASE}: verification status is ${VERIFY_STATUS:-unknown}. Skipping commit/push.
```

Stop without any git mutation.

**If `VERIFY_STATUS` is `passed`:** continue to finalize_git.

Before finalizing git, require lifecycle compliance for the same phase attempt:

```bash
LIFECYCLE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" verify lifecycle "${PHASE}" --require-plans --require-verification --raw)
```

If `valid` is `false`, display:
```
Phase ${PHASE}: lifecycle validation failed. Skipping commit/push.

${validator reasons}
```

Stop without any git mutation.
</step>

<step name="finalize_git">
Finalize the current branch:

```bash
DIRTY=$(git status --short)
if [ -n "$DIRTY" ]; then
  git add -A
  git commit -m "chore(${padded_phase}): finalize autonomous phase ${phase_number}"
fi
```

Detect the current branch and upstream:

```bash
CURRENT_BRANCH=$(git branch --show-current)
UPSTREAM_REF=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
```

This final push step does not create or switch branches. It only pushes the branch that is already checked out.

**If `CURRENT_BRANCH` is empty:** stop with an error — cannot push from a detached HEAD.

**If `UPSTREAM_REF` is not empty:** push to the existing upstream:

```bash
git push
```

**If `UPSTREAM_REF` is empty:** set upstream and push the current branch to `origin`:

```bash
git push --set-upstream origin "${CURRENT_BRANCH}"
```

Display:
```
Phase ${phase_number} pushed from ${CURRENT_BRANCH}.
```
</step>

</process>

<success_criteria>
- Single-phase preview shows the phase and `discuss → plan → execute → commit/push`
- Range preview shows the covered phases and `discuss → plan → execute → commit/push`
- Range mode exits early with a no-op message when no phases match
- Range mode delegates to `/gsd-autonomous --yolo --push-after-phase`
- Single-phase mode commits and pushes only when verification status is `passed`
- Dirty trees receive a deterministic phase-scoped final commit before push
- Existing upstream is preferred; otherwise upstream is created on `origin`
- Strict push never creates or switches to a different branch during finalization
</success_criteria>
