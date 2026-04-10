# Manual Update (Fork Checkout Install)

Use this procedure when you want to update directly from the fork source instead of the published npm package.

## Source

- Fork repo: `https://github.com/pRizz/get-shit-done.git`
- Default ref: `main`
- `/gsd-update` now follows the same fork-based flow by default

## Prerequisites

- `git` installed
- Node.js installed

## Global install (recommended)

```bash
TMP_ROOT="$(node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-update-')));
NODE
)"

TARGET_REF="main"  # Replace with another branch or commit if needed

git clone --filter=blob:none --no-checkout https://github.com/pRizz/get-shit-done.git "$TMP_ROOT/get-shit-done"
git -C "$TMP_ROOT/get-shit-done" fetch --depth=200 origin "$TARGET_REF"
git -C "$TMP_ROOT/get-shit-done" checkout --detach FETCH_HEAD
node "$TMP_ROOT/get-shit-done/scripts/build-hooks.js"
node "$TMP_ROOT/get-shit-done/bin/install.js" --claude --global
rm -f ~/.cache/gsd/gsd-update-check.json
rm -rf "$TMP_ROOT"
```

## Local install (only if you intentionally keep a project-local install)

Run the installer from the temp checkout, but keep your shell in the target project directory because `--local` installs into the current directory:

```bash
cd /path/to/your/project

TMP_ROOT="$(node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-update-')));
NODE
)"

TARGET_REF="main"  # Replace with another branch or commit if needed

git clone --filter=blob:none --no-checkout https://github.com/pRizz/get-shit-done.git "$TMP_ROOT/get-shit-done"
git -C "$TMP_ROOT/get-shit-done" fetch --depth=200 origin "$TARGET_REF"
git -C "$TMP_ROOT/get-shit-done" checkout --detach FETCH_HEAD
node "$TMP_ROOT/get-shit-done/scripts/build-hooks.js"
node "$TMP_ROOT/get-shit-done/bin/install.js" --claude --local
rm -f ~/.cache/gsd/gsd-update-check.json
rm -rf "$TMP_ROOT"
```

`/gsd-update` prefers the global install path and should only keep the local install when you explicitly choose that option.

## Runtime flags

Replace `--claude` with the flag for your runtime:

| Runtime | Flag |
|---|---|
| Claude Code | `--claude` |
| Gemini CLI | `--gemini` |
| OpenCode | `--opencode` |
| Kilo | `--kilo` |
| Codex | `--codex` |
| Copilot | `--copilot` |
| Cursor | `--cursor` |
| Windsurf | `--windsurf` |
| Augment | `--augment` |
| Trae | `--trae` |
| All runtimes | `--all` |

## What the installer replaces

The installer performs a clean wipe-and-replace of GSD-managed directories only:

- `get-shit-done/` — workflows, references, templates
- `commands/gsd/` or runtime-equivalent GSD skills
- `agents/gsd-*` — GSD agents
- `hooks/` — installed GSD hooks for runtimes that use them

**What is preserved:**
- Custom agents not prefixed with `gsd-`
- Custom commands outside `commands/gsd/`
- Your instruction files such as `CLAUDE.md`
- Custom hooks outside the managed GSD hook set

Locally modified GSD files are automatically backed up to `gsd-local-patches/` before the install. Run `/gsd-reapply-patches` after updating to merge your modifications back in.

## Final step

Restart your runtime to pick up the new commands and hooks.
