---
name: gsd:profile-user
description: Generate developer behavioral profile and create Claude-discoverable artifacts
argument-hint: "[--questionnaire] [--refresh]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
---

<objective>
Generate a developer behavioral profile from session analysis (or questionnaire) and produce artifacts (USER-PROFILE.md, /gsd-dev-preferences, CLAUDE.md section) that personalize Claude's responses.

Routes to the profile-user workflow which orchestrates the full flow: consent gate, session analysis or questionnaire fallback, profile generation, result display, and artifact selection.
</objective>

<execution-context>
@~/.claude/get-shit-done/workflows/profile-user.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution-context>

<context>
Flags from $ARGUMENTS:
- `--questionnaire` -- Skip session analysis entirely, use questionnaire-only path
- `--refresh` -- Rebuild profile even when one exists, backup old profile, show dimension diff
</context>

<process>
Execute the profile-user workflow end-to-end.

The workflow handles all logic including:

1. Initialization and existing profile detection
1. Consent gate before session analysis
1. Session scanning and data sufficiency checks
1. Session analysis (profiler agent) or questionnaire fallback
1. Cross-project split resolution
1. Profile writing to USER-PROFILE.md
1. Result display with report card and highlights
1. Artifact selection (dev-preferences, CLAUDE.md sections)
1. Sequential artifact generation
1. Summary with refresh diff (if applicable)
   </process>
