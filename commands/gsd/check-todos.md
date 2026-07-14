---
name: gsd:check-todos
description: List pending todos and select one to work on
argument-hint: [area filter]
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.

Routes to the check-todos workflow which handles:

- Todo counting and listing with area filtering
- Interactive selection with full context loading
- Roadmap correlation checking
- Action routing (work now, add to phase, brainstorm, create phase)
- STATE.md updates and git commits
  </objective>

<execution-context>
@~/.claude/get-shit-done/workflows/check-todos.md
</execution-context>

<context>
Arguments: $ARGUMENTS (optional area filter)

Todo state and roadmap correlation are loaded in-workflow using `init todos` and targeted reads.
</context>

<process>
**Follow the check-todos workflow** from `@~/.claude/get-shit-done/workflows/check-todos.md`.

The workflow handles all logic including:

1. Todo existence checking
1. Area filtering
1. Interactive listing and selection
1. Full context loading with file summaries
1. Roadmap correlation checking
1. Action offering and execution
1. STATE.md updates
1. Git commits
   </process>
