# Yolo Skill Audit

This document audits the current `*-yolo-*` skill family for wrapper-level sub-agent opportunities.

The audit is intentionally conservative:
- do not add wrapper-level sub-agents when the wrapper is only a thin delegator
- prefer downstream workflows that already own agent orchestration
- keep gating, state mutation, and git finalization deterministic in the current thread

## Audit Criteria

Use this rubric for every target:

1. If the skill is only a thin delegator to a downstream workflow that already spawns agents, do not add wrapper-level sub-agents.
2. If the skill performs heavy, independent, non-interactive work inline in the current thread, recommend sub-agent delegation.
3. If the skill has tight gating, sequential state mutation, or git-finalization behavior, prefer keeping that part inline.
4. If sub-agent use would duplicate downstream orchestration or obscure failure handling, reject it.

## Audit Results

### `gsd-yolo-discuss`

- Verdict: No new wrapper-level sub-agent usage
- Recommended action: Keep the wrapper thin
- Rationale: This is a single-phase veneer over `gsd-discuss-phase --yolo`. The wrapper only validates arguments, previews the phase, and delegates. The real work happens in `gsd-discuss-phase`, which already performs the meaningful discussion-phase orchestration and can spawn advisor research tasks where applicable.

### `gsd-yolo-discuss-plan-and-execute`

- Verdict: No new wrapper-level sub-agent usage
- Recommended action: Keep the wrapper thin
- Rationale: The single-phase path delegates to `gsd-discuss-phase --yolo --chain`. The range path delegates to `gsd-autonomous --yolo`. Both downstream flows already own planning and execution orchestration. Adding sub-agents at the wrapper layer would only duplicate routing behavior and complicate failure visibility.

### `gsd-yolo-discuss-plan-execute-commit-and-push`

- Verdict: No new wrapper-level sub-agent usage
- Recommended action: Keep wrapper orchestration inline
- Rationale: The wrapper is still thin on the orchestration side, and its one wrapper-owned heavy concern is final git gating. That commit/push path should stay deterministic and inline so verification status, branch checks, and push failures remain explicit and easy to reason about.

### `gsd-yolo-discuss-plan-execute-commit-and-push-all`

- Verdict: No new wrapper-level sub-agent usage
- Recommended action: Keep the wrapper declarative
- Rationale: This command is a strict alias over `gsd-autonomous --yolo --push-after-phase`. It previews the remaining phases and then delegates. Any wrapper-level sub-agenting here would only obscure the fact that the autonomous workflow is the real execution surface.

### `gsd-autonomous --yolo`

- Verdict: Only current high-value candidate for future sub-agent expansion
- Recommended action: Record as follow-up, do not change now
- Rationale: Unlike the wrappers, `gsd-autonomous --yolo` is a substantive orchestrator. It already owns milestone discovery, phase iteration, verification routing, gap handling, and git-finalization gates. If main-thread context pressure becomes a problem, the most plausible future improvement is to evaluate more background-agent dispatch around plan/execute in yolo mode while keeping discuss resolution, verification routing, and post-verification git gates deterministic.

## Follow-Up Opportunity

If future work is needed, evaluate only this:

- `gsd-autonomous --yolo`
  - investigate whether more background-agent dispatch for plan/execute would reduce main-thread context growth
  - keep discuss resolution inline enough to preserve deterministic phase previews and clear operator feedback
  - keep post-verification routing and git-finalization gates inline

No wrapper-level sub-agent expansion is currently recommended.
