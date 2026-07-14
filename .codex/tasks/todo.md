## task-mdformat-compat | 2026-07-13 | Make GSD Markdown mdformat-compatible

- [x] Harden frontmatter parsing and serialization in the CLI, SDK, and installer.
- [x] Make shipped YAML/frontmatter and Markdown fences valid.
- [x] Add downstream mdformat setup/migration tooling.
- [x] Add mdformat configuration, documentation, and CI.
- [x] Migrate pseudo-XML marker names to kebab-case with legacy reader compatibility.
- [x] Normalize all tracked Markdown with the pinned formatter.
- [x] Verify YAML validity, formatter idempotence, root tests, SDK tests, and the final diff.

Completion review: Implemented the pinned frontmatter/GFM formatter contract, anchored frontmatter handling, canonical marker migration with legacy aliases, opt-in downstream tooling, and CI. Verified 117 YAML headers, 2,904 root tests, 740 SDK tests, SDK build, formatter idempotence, semantic round trips, and a clean diff check. Residual risk is limited to the intentionally large one-time mechanical Markdown normalization diff.
