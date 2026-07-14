---
name: gsd:add-phase
description: Add phase to end of current milestone in roadmap
argument-hint: <description>
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

Routes to the add-phase workflow which handles:

- Phase number calculation (next sequential integer)
- Directory creation with slug generation
- Roadmap structure updates
- STATE.md roadmap evolution tracking
  </objective>

<execution-context>
@~/.claude/get-shit-done/workflows/add-phase.md
</execution-context>

<context>
Arguments: $ARGUMENTS (phase description)

Roadmap and state are resolved in-workflow via `init phase-op` and targeted tool calls.
</context>

<process>
**Follow the add-phase workflow** from `@~/.claude/get-shit-done/workflows/add-phase.md`.

The workflow handles all logic including:

1. Argument parsing and validation
1. Roadmap existence checking
1. Current milestone identification
1. Next phase number calculation (ignoring decimals)
1. Slug generation from description
1. Phase directory creation
1. Roadmap entry insertion
1. STATE.md updates
   </process>
