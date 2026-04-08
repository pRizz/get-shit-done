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

**If `HAS_RANGE_FLAGS` is true:** delegate to autonomous strict-push mode:

```bash
Skill(skill="gsd-autonomous", args="${ARGUMENTS} --yolo --push-after-phase")
```

Then stop — autonomous owns the per-phase git finalization in range mode.

**If `HAS_RANGE_FLAGS` is empty:** continue to single_phase_chain.
</step>

<step name="single_phase_chain">
Run single-phase yolo discuss plus the existing auto-chain:

```bash
Skill(skill="gsd-discuss-phase", args="${ARGUMENTS} --yolo --chain")
```

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
- Range mode delegates to `/gsd-autonomous --yolo --push-after-phase`
- Single-phase mode commits and pushes only when verification status is `passed`
- Dirty trees receive a deterministic phase-scoped final commit before push
- Existing upstream is preferred; otherwise upstream is created on `origin`
</success_criteria>
