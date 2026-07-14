# Planner Subagent Prompt Template

Template for spawning gsd-planner agent. The agent contains all planning expertise - this template provides planning context only.

______________________________________________________________________

## Template

```markdown
<planning-context>

**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:**
@.planning/STATE.md

**Roadmap:**
@.planning/ROADMAP.md

**Requirements (if exists):**
@.planning/REQUIREMENTS.md

**Phase Context (if exists):**
@.planning/phases/{phase_dir}/{phase_num}-CONTEXT.md

**Research (if exists):**
@.planning/phases/{phase_dir}/{phase_num}-RESEARCH.md

**Gap Closure (if --gaps mode):**
@.planning/phases/{phase_dir}/{phase_num}-VERIFICATION.md
@.planning/phases/{phase_dir}/{phase_num}-UAT.md

</planning-context>

<downstream-consumer>
Output consumed by /gsd-execute-phase
Plans must be executable prompts with:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream-consumer>

<quality-gate>
Before returning PLANNING COMPLETE:
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality-gate>
```

______________________________________________________________________

## Placeholders

| Placeholder                 | Source                 | Example            |
| --------------------------- | ---------------------- | ------------------ |
| `{phase_number}`            | From roadmap/arguments | `5` or `2.1`       |
| `{phase_dir}`               | Phase directory name   | `05-user-profiles` |
| `{phase}`                   | Phase prefix           | `05`               |
| `{standard \| gap_closure}` | Mode flag              | `standard`         |

______________________________________________________________________

## Usage

**From /gsd-plan-phase (standard mode):**

```python
Task(
  prompt=filled_template,
  subagent_type="gsd-planner",
  description="Plan Phase {phase}"
)
```

**From /gsd-plan-phase --gaps (gap closure mode):**

```python
Task(
  prompt=filled_template,  # with mode: gap_closure
  subagent_type="gsd-planner",
  description="Plan gaps for Phase {phase}"
)
```

______________________________________________________________________

## Continuation

For checkpoints, spawn fresh agent with:

```markdown
<objective>
Continue planning for Phase {phase_number}: {phase_name}
</objective>

<prior-state>
Phase directory: @.planning/phases/{phase_dir}/
Existing plans: @.planning/phases/{phase_dir}/*-PLAN.md
</prior-state>

<checkpoint-response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint-response>

<mode>
Continue: {standard | gap_closure}
</mode>
```

______________________________________________________________________

**Note:** Planning methodology, task breakdown, dependency analysis, wave assignment, TDD detection, and goal-backward derivation are baked into the gsd-planner agent. This template only passes context.
