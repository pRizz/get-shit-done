<purpose>
Check for GSD updates from the fork repo, preview commit changes, obtain user confirmation, and install from a temporary fork checkout with cache clearing.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse optional `--ref <sha-or-branch>` from `$ARGUMENTS`.

- Default `TARGET_REF="main"`
- Use `SOURCE_REPO="https://github.com/pRizz/get-shit-done.git"`
- Use `SOURCE_REPO_WEB="https://github.com/pRizz/get-shit-done"`
- Capture `ORIGINAL_CWD="$(pwd)"` before creating the temp checkout

Run:

```bash
TARGET_REF="$(printf '%s\n' "$ARGUMENTS" | grep -oE -- '--ref[[:space:]]+[^[:space:]]+' | awk '{print $2}' | tail -1)"
if [ -z "$TARGET_REF" ]; then
  TARGET_REF="main"
fi

if printf '%s\n' "$ARGUMENTS" | grep -q -- '--ref' && [ -z "$TARGET_REF" ]; then
  echo "Usage: /gsd-update [--ref <sha-or-branch>]"
  exit 1
fi

SOURCE_REPO="https://github.com/pRizz/get-shit-done.git"
SOURCE_REPO_WEB="https://github.com/pRizz/get-shit-done"
ORIGINAL_CWD="$(pwd)"
```
</step>

<step name="resolve_install_target">
Detect the active GSD install using the same runtime/config precedence as `version.md`.

First, derive `PREFERRED_CONFIG_DIR` and `PREFERRED_RUNTIME` from the invoking prompt's `execution_context` path:
- If the path contains `/get-shit-done/workflows/update.md`, strip that suffix and store the remainder as `PREFERRED_CONFIG_DIR`
- Path contains `/.codex/` -> `codex`
- Path contains `/.gemini/` -> `gemini`
- Path contains `/.config/kilo/` or `/.kilo/`, or `PREFERRED_CONFIG_DIR` contains `kilo.json` / `kilo.jsonc` -> `kilo`
- Path contains `/.config/opencode/` or `/.opencode/`, or `PREFERRED_CONFIG_DIR` contains `opencode.json` / `opencode.jsonc` -> `opencode`
- Otherwise -> `claude`

Use `PREFERRED_CONFIG_DIR` when available so custom `--config-dir` installs are checked before default locations.
Use `PREFERRED_RUNTIME` as the first runtime checked so `/gsd-update` targets the runtime that invoked it.

Run:

```bash
expand_home() {
  case "$1" in
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

RUNTIME_DIRS=( "claude:.claude" "opencode:.config/opencode" "opencode:.opencode" "gemini:.gemini" "kilo:.config/kilo" "kilo:.kilo" "codex:.codex" )
ENV_RUNTIME_DIRS=()

if [ -n "$PREFERRED_CONFIG_DIR" ]; then
  PREFERRED_CONFIG_DIR="$(expand_home "$PREFERRED_CONFIG_DIR")"
  if [ -z "$PREFERRED_RUNTIME" ]; then
    if [ -f "$PREFERRED_CONFIG_DIR/kilo.json" ] || [ -f "$PREFERRED_CONFIG_DIR/kilo.jsonc" ]; then
      PREFERRED_RUNTIME="kilo"
    elif [ -f "$PREFERRED_CONFIG_DIR/opencode.json" ] || [ -f "$PREFERRED_CONFIG_DIR/opencode.jsonc" ]; then
      PREFERRED_RUNTIME="opencode"
    elif [ -f "$PREFERRED_CONFIG_DIR/config.toml" ]; then
      PREFERRED_RUNTIME="codex"
    fi
  fi
fi

if [ -z "$PREFERRED_RUNTIME" ]; then
  if [ -n "$CODEX_HOME" ]; then
    PREFERRED_RUNTIME="codex"
  elif [ -n "$GEMINI_CONFIG_DIR" ]; then
    PREFERRED_RUNTIME="gemini"
  elif [ -n "$KILO_CONFIG_DIR" ] || [ -n "$KILO_CONFIG" ]; then
    PREFERRED_RUNTIME="kilo"
  elif [ -n "$OPENCODE_CONFIG_DIR" ] || [ -n "$OPENCODE_CONFIG" ]; then
    PREFERRED_RUNTIME="opencode"
  elif [ -n "$CLAUDE_CONFIG_DIR" ]; then
    PREFERRED_RUNTIME="claude"
  else
    PREFERRED_RUNTIME="claude"
  fi
fi

if [ -n "$PREFERRED_CONFIG_DIR" ] && { [ -f "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION" ] || [ -f "$PREFERRED_CONFIG_DIR/get-shit-done/workflows/update.md" ]; }; then
  INSTALL_SCOPE="GLOBAL"
  for dir in .claude .config/opencode .opencode .gemini .config/kilo .kilo .codex; do
    resolved_local="$(cd "./$dir" 2>/dev/null && pwd)"
    if [ -n "$resolved_local" ] && [ "$resolved_local" = "$PREFERRED_CONFIG_DIR" ]; then
      INSTALL_SCOPE="LOCAL"
      break
    fi
  done

  if [ -f "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION"; then
    INSTALLED_VERSION="$(cat "$PREFERRED_CONFIG_DIR/get-shit-done/VERSION")"
  else
    INSTALLED_VERSION="0.0.0"
  fi

  echo "$INSTALLED_VERSION"
  echo "$INSTALL_SCOPE"
  echo "${PREFERRED_RUNTIME:-claude}"
  echo "$PREFERRED_CONFIG_DIR"
  exit 0
fi

if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "claude:$(expand_home "$CLAUDE_CONFIG_DIR")" )
fi
if [ -n "$GEMINI_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "gemini:$(expand_home "$GEMINI_CONFIG_DIR")" )
fi
if [ -n "$KILO_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "kilo:$(expand_home "$KILO_CONFIG_DIR")" )
elif [ -n "$KILO_CONFIG" ]; then
  ENV_RUNTIME_DIRS+=( "kilo:$(dirname "$(expand_home "$KILO_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  ENV_RUNTIME_DIRS+=( "kilo:$(expand_home "$XDG_CONFIG_HOME")/kilo" )
fi
if [ -n "$OPENCODE_CONFIG_DIR" ]; then
  ENV_RUNTIME_DIRS+=( "opencode:$(expand_home "$OPENCODE_CONFIG_DIR")" )
elif [ -n "$OPENCODE_CONFIG" ]; then
  ENV_RUNTIME_DIRS+=( "opencode:$(dirname "$(expand_home "$OPENCODE_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  ENV_RUNTIME_DIRS+=( "opencode:$(expand_home "$XDG_CONFIG_HOME")/opencode" )
fi
if [ -n "$CODEX_HOME" ]; then
  ENV_RUNTIME_DIRS+=( "codex:$(expand_home "$CODEX_HOME")" )
fi

ORDERED_RUNTIME_DIRS=()
for entry in "${RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" = "$PREFERRED_RUNTIME" ]; then
    ORDERED_RUNTIME_DIRS+=( "$entry" )
  fi
done
ORDERED_ENV_RUNTIME_DIRS=()
for entry in "${ENV_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" = "$PREFERRED_RUNTIME" ]; then
    ORDERED_ENV_RUNTIME_DIRS+=( "$entry" )
  fi
done
for entry in "${ENV_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" != "$PREFERRED_RUNTIME" ]; then
    ORDERED_ENV_RUNTIME_DIRS+=( "$entry" )
  fi
done
for entry in "${RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  if [ "$runtime" != "$PREFERRED_RUNTIME" ]; then
    ORDERED_RUNTIME_DIRS+=( "$entry" )
  fi
done

LOCAL_VERSION_FILE="" LOCAL_MARKER_FILE="" LOCAL_DIR="" LOCAL_RUNTIME=""
for entry in "${ORDERED_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  dir="${entry#*:}"
  if [ -f "./$dir/get-shit-done/VERSION" ] || [ -f "./$dir/get-shit-done/workflows/update.md" ]; then
    LOCAL_RUNTIME="$runtime"
    LOCAL_VERSION_FILE="./$dir/get-shit-done/VERSION"
    LOCAL_MARKER_FILE="./$dir/get-shit-done/workflows/update.md"
    LOCAL_DIR="$(cd "./$dir" 2>/dev/null && pwd)"
    break
  fi
done

GLOBAL_VERSION_FILE="" GLOBAL_MARKER_FILE="" GLOBAL_DIR="" GLOBAL_RUNTIME=""
for entry in "${ORDERED_ENV_RUNTIME_DIRS[@]}"; do
  runtime="${entry%%:*}"
  dir="${entry#*:}"
  if [ -f "$dir/get-shit-done/VERSION" ] || [ -f "$dir/get-shit-done/workflows/update.md" ]; then
    GLOBAL_RUNTIME="$runtime"
    GLOBAL_VERSION_FILE="$dir/get-shit-done/VERSION"
    GLOBAL_MARKER_FILE="$dir/get-shit-done/workflows/update.md"
    GLOBAL_DIR="$(cd "$dir" 2>/dev/null && pwd)"
    break
  fi
done

if [ -z "$GLOBAL_RUNTIME" ]; then
  for entry in "${ORDERED_RUNTIME_DIRS[@]}"; do
    runtime="${entry%%:*}"
    dir="${entry#*:}"
    if [ -f "$HOME/$dir/get-shit-done/VERSION" ] || [ -f "$HOME/$dir/get-shit-done/workflows/update.md" ]; then
      GLOBAL_RUNTIME="$runtime"
      GLOBAL_VERSION_FILE="$HOME/$dir/get-shit-done/VERSION"
      GLOBAL_MARKER_FILE="$HOME/$dir/get-shit-done/workflows/update.md"
      GLOBAL_DIR="$(cd "$HOME/$dir" 2>/dev/null && pwd)"
      break
    fi
  done
fi

IS_LOCAL=false
if [ -n "$LOCAL_VERSION_FILE" ] && [ -f "$LOCAL_VERSION_FILE" ] && [ -f "$LOCAL_MARKER_FILE" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$LOCAL_VERSION_FILE"; then
  if [ -z "$GLOBAL_DIR" ] || [ "$LOCAL_DIR" != "$GLOBAL_DIR" ]; then
    IS_LOCAL=true
  fi
fi

if [ "$IS_LOCAL" = true ]; then
  INSTALLED_VERSION="$(cat "$LOCAL_VERSION_FILE")"
  INSTALL_SCOPE="LOCAL"
  TARGET_RUNTIME="$LOCAL_RUNTIME"
  TARGET_DIR="$LOCAL_DIR"
elif [ -n "$GLOBAL_VERSION_FILE" ] && [ -f "$GLOBAL_VERSION_FILE" ] && [ -f "$GLOBAL_MARKER_FILE" ] && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' "$GLOBAL_VERSION_FILE"; then
  INSTALLED_VERSION="$(cat "$GLOBAL_VERSION_FILE")"
  INSTALL_SCOPE="GLOBAL"
  TARGET_RUNTIME="$GLOBAL_RUNTIME"
  TARGET_DIR="$GLOBAL_DIR"
elif [ -n "$LOCAL_RUNTIME" ] && [ -f "$LOCAL_MARKER_FILE" ]; then
  INSTALLED_VERSION="0.0.0"
  INSTALL_SCOPE="LOCAL"
  TARGET_RUNTIME="$LOCAL_RUNTIME"
  TARGET_DIR="$LOCAL_DIR"
elif [ -n "$GLOBAL_RUNTIME" ] && [ -f "$GLOBAL_MARKER_FILE" ]; then
  INSTALLED_VERSION="0.0.0"
  INSTALL_SCOPE="GLOBAL"
  TARGET_RUNTIME="$GLOBAL_RUNTIME"
  TARGET_DIR="$GLOBAL_DIR"
else
  INSTALLED_VERSION="0.0.0"
  INSTALL_SCOPE="UNKNOWN"
  TARGET_RUNTIME="claude"
  TARGET_DIR=""
fi

echo "$INSTALLED_VERSION"
echo "$INSTALL_SCOPE"
echo "$TARGET_RUNTIME"
echo "$TARGET_DIR"
```

Parse output:
- Line 1 = installed version
- Line 2 = install scope (`LOCAL`, `GLOBAL`, or `UNKNOWN`)
- Line 3 = target runtime
- Line 4 = resolved install directory

If scope is `UNKNOWN`, continue with `FINAL_INSTALL_SCOPE="GLOBAL"` and `TARGET_RUNTIME="claude"` fallback.
</step>

<step name="read_release_metadata">
Read the installed release metadata from `RELEASE.json`.

Run:

```bash
RELEASE_FILE="$TARGET_DIR/get-shit-done/RELEASE.json"

if [ -n "$TARGET_DIR" ] && [ -f "$RELEASE_FILE" ]; then
  release_output="$(node - <<'NODE' "$RELEASE_FILE" "$INSTALLED_VERSION"
const fs = require('fs');

const releaseFile = process.argv[2];
const installedVersion = process.argv[3];

try {
  const parsed = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
  const version = typeof parsed.version === 'string' && parsed.version.trim()
    ? parsed.version.trim()
    : installedVersion;
  const gitHead = typeof parsed.gitHead === 'string' && parsed.gitHead.trim()
    ? parsed.gitHead.trim()
    : 'unavailable';
  const commitDate = typeof parsed.commitDate === 'string' && parsed.commitDate.trim()
    ? parsed.commitDate.trim()
    : 'unavailable';

  process.stdout.write(`${version}\n${gitHead}\n${commitDate}\n`);
} catch {
  process.stdout.write(`${installedVersion}\nunavailable\nunavailable\n`);
}
NODE
)"
else
  release_output="$(printf '%s\n%s\n%s\n' "$INSTALLED_VERSION" "unavailable" "unavailable")"
fi

DISPLAY_VERSION="$(printf '%s\n' "$release_output" | sed -n '1p')"
INSTALLED_GIT_HEAD="$(printf '%s\n' "$release_output" | sed -n '2p')"
INSTALLED_COMMIT_DATE="$(printf '%s\n' "$release_output" | sed -n '3p')"
```

If `INSTALLED_GIT_HEAD` is `unavailable`, treat the install as a legacy install that needs a metadata-refreshing reinstall.
</step>

<step name="prepare_temp_checkout">
Clone the fork into a portable system temp directory and resolve the exact target commit from the requested ref.

Run:

```bash
TMP_ROOT="$(node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-update-')));
NODE
)"
REPO_DIR="$TMP_ROOT/get-shit-done"

cleanup_temp() {
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then
    rm -rf "$TMP_ROOT"
  fi
}

if ! git clone --filter=blob:none --no-checkout "$SOURCE_REPO" "$REPO_DIR"; then
  cleanup_temp
  echo "Could not clone $SOURCE_REPO"
  exit 1
fi

if ! git -C "$REPO_DIR" fetch --depth=200 origin "$TARGET_REF"; then
  cleanup_temp
  echo "Could not resolve ref '$TARGET_REF' from $SOURCE_REPO"
  exit 1
fi

if ! git -C "$REPO_DIR" checkout --detach FETCH_HEAD; then
  cleanup_temp
  echo "Could not check out resolved ref '$TARGET_REF'"
  exit 1
fi

TARGET_GIT_HEAD="$(git -C "$REPO_DIR" rev-parse HEAD)"
TARGET_COMMIT_DATE="$(git -C "$REPO_DIR" show -s --format=%cI HEAD)"
TARGET_COMMIT_URL="$SOURCE_REPO_WEB/commit/$TARGET_GIT_HEAD"
```
</step>

<step name="compare_current_vs_target">
Compare the installed build against the resolved fork commit.

**If `INSTALLED_GIT_HEAD` equals `TARGET_GIT_HEAD`:**

```text
## GSD Update

**Installed:** {DISPLAY_VERSION} @ {INSTALLED_GIT_HEAD}
**Target:** {TARGET_REF} -> {TARGET_GIT_HEAD}

You're already on the requested fork commit.
```

Clean up `TMP_ROOT` and exit.

**If `INSTALLED_GIT_HEAD` is available and differs from `TARGET_GIT_HEAD`:**
- Attempt to fetch the installed commit into the temp checkout:

```bash
git -C "$REPO_DIR" fetch --depth=200 origin "$INSTALLED_GIT_HEAD" 2>/dev/null || true
COMPARE_URL="$SOURCE_REPO_WEB/compare/$INSTALLED_GIT_HEAD...$TARGET_GIT_HEAD"
CHANGE_SUMMARY=""

if git -C "$REPO_DIR" cat-file -e "$INSTALLED_GIT_HEAD^{commit}" 2>/dev/null; then
  CHANGE_SUMMARY="$(git -C "$REPO_DIR" log --oneline --no-merges "${INSTALLED_GIT_HEAD}..${TARGET_GIT_HEAD}" | head -20)"
fi
```

If `CHANGE_SUMMARY` is empty, still show `COMPARE_URL` and explain that a detailed local summary was unavailable.

**If `INSTALLED_GIT_HEAD` is `unavailable`:**
- Treat this as an update opportunity even if `DISPLAY_VERSION` looks current.
- Explain that this install predates commit metadata, so `/gsd-update` will reinstall from the fork to stamp `RELEASE.json.gitHead`.
- Skip the commit range summary and only show:
  - target ref
  - target git SHA
  - target commit datetime
  - target commit URL
</step>

<step name="choose_install_scope">
Prefer global installs for fork updates.

Initialize:

```bash
FINAL_INSTALL_SCOPE="$INSTALL_SCOPE"
if [ "$FINAL_INSTALL_SCOPE" = "UNKNOWN" ]; then
  FINAL_INSTALL_SCOPE="GLOBAL"
fi
```

**If `INSTALL_SCOPE` is `LOCAL`:**
Use AskUserQuestion:
- Question: `A local GSD install was detected in the current project. Global install is preferred for fork updates. Which target should I use?`
- Options:
  - `Install globally (recommended)`
  - `Keep the local install`
  - `Cancel`

Apply the response:
- `Install globally (recommended)` -> `FINAL_INSTALL_SCOPE="GLOBAL"`
- `Keep the local install` -> `FINAL_INSTALL_SCOPE="LOCAL"`
- `Cancel` -> clean up `TMP_ROOT` and exit

**If `INSTALL_SCOPE` is `GLOBAL` or `UNKNOWN`:**
Do not prompt. Continue with `FINAL_INSTALL_SCOPE` as set above.
</step>

<step name="show_changes_and_confirm">
Display the planned source, target, and install mode before making any changes.

Show:

```text
## GSD Update Available

**Source Repo:** https://github.com/pRizz/get-shit-done
**Target Ref:** {TARGET_REF}
**Installed:** {DISPLAY_VERSION} @ {INSTALLED_GIT_HEAD or unavailable}
**Target Commit:** {TARGET_GIT_HEAD}
**Target Commit Datetime:** {TARGET_COMMIT_DATE}
**Install Runtime:** {TARGET_RUNTIME}
**Install Scope:** {FINAL_INSTALL_SCOPE}
```

**If `CHANGE_SUMMARY` exists:**
Show up to the first 20 commit subjects and the compare link:

```text
### Commits Since Installed Build
{CHANGE_SUMMARY}

Compare: {COMPARE_URL}
```

**If `INSTALLED_GIT_HEAD` is unavailable:**
Show:

```text
This install has no recorded git commit in RELEASE.json, so a detailed compare preview is unavailable.
Running this update will migrate the install onto fork-based commit metadata.
```

Then show the clean install warning:

```text
⚠️  The installer performs a clean install of GSD-managed directories:
- `commands/gsd/` will be wiped and replaced where applicable
- `get-shit-done/` will be wiped and replaced
- `agents/gsd-*` files will be replaced
- `hooks/` will be replaced for runtimes that use GSD hooks

Your custom files outside the managed GSD paths are preserved.
Locally modified GSD files are backed up to `gsd-local-patches/`.
```

Use AskUserQuestion:
- Question: `Proceed with the fork update now?`
- Options:
  - `Yes, update now`
  - `No, cancel`

If the user cancels, clean up `TMP_ROOT` and exit.
</step>

<step name="run_update">
Build the hook bundle in the temp checkout, then run the installer from that checkout.

Run:

```bash
if ! node "$REPO_DIR/scripts/build-hooks.js"; then
  cleanup_temp
  echo "Hook build failed in temp checkout"
  exit 1
fi

RUNTIME_FLAG="--$TARGET_RUNTIME"

if [ "$FINAL_INSTALL_SCOPE" = "LOCAL" ]; then
  if ! (cd "$ORIGINAL_CWD" && node "$REPO_DIR/bin/install.js" "$RUNTIME_FLAG" --local); then
    cleanup_temp
    echo "Local install failed"
    exit 1
  fi
else
  if ! node "$REPO_DIR/bin/install.js" "$RUNTIME_FLAG" --global; then
    cleanup_temp
    echo "Global install failed"
    exit 1
  fi
fi
```

Clear the update cache so the statusline indicator disappears:

```bash
expand_home() {
  case "$1" in
    "~/"*) printf '%s/%s\n' "$HOME" "${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

CACHE_DIRS=()
if [ -n "$PREFERRED_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$PREFERRED_CONFIG_DIR")" )
fi
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$CLAUDE_CONFIG_DIR")" )
fi
if [ -n "$GEMINI_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$GEMINI_CONFIG_DIR")" )
fi
if [ -n "$KILO_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$KILO_CONFIG_DIR")" )
elif [ -n "$KILO_CONFIG" ]; then
  CACHE_DIRS+=( "$(dirname "$(expand_home "$KILO_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  CACHE_DIRS+=( "$(expand_home "$XDG_CONFIG_HOME")/kilo" )
fi
if [ -n "$OPENCODE_CONFIG_DIR" ]; then
  CACHE_DIRS+=( "$(expand_home "$OPENCODE_CONFIG_DIR")" )
elif [ -n "$OPENCODE_CONFIG" ]; then
  CACHE_DIRS+=( "$(dirname "$(expand_home "$OPENCODE_CONFIG")")" )
elif [ -n "$XDG_CONFIG_HOME" ]; then
  CACHE_DIRS+=( "$(expand_home "$XDG_CONFIG_HOME")/opencode" )
fi
if [ -n "$CODEX_HOME" ]; then
  CACHE_DIRS+=( "$(expand_home "$CODEX_HOME")" )
fi

rm -f "$HOME/.cache/gsd/gsd-update-check.json"
for dir in "${CACHE_DIRS[@]}"; do
  if [ -n "$dir" ]; then
    rm -f "$dir/cache/gsd-update-check.json"
  fi
done

for dir in .claude .config/opencode .opencode .gemini .config/kilo .kilo .codex; do
  rm -f "./$dir/cache/gsd-update-check.json"
  rm -f "$HOME/$dir/cache/gsd-update-check.json"
done
```

Always clean up the temp checkout at the end:

```bash
cleanup_temp
```
</step>

<step name="display_result">
Display completion using the fork commit metadata instead of changelog sections.

Format:

```text
╔═══════════════════════════════════════════════════════════╗
║  GSD Updated from pRizz/get-shit-done                    ║
╚═══════════════════════════════════════════════════════════╝

Installed runtime: {TARGET_RUNTIME}
Installed scope: {FINAL_INSTALL_SCOPE}
Target ref: {TARGET_REF}
Target commit: {TARGET_GIT_HEAD}
Target commit datetime: {TARGET_COMMIT_DATE}
Commit URL: {TARGET_COMMIT_URL}

Restart your runtime to pick up the new commands.
```
</step>

<step name="check_local_patches">
If the installer output included `Local patches detected`, add:

```text
Local patches were backed up during the update.
Run `/gsd-reapply-patches` (or `$gsd-reapply-patches` in Codex) to merge them into the new version.
```
</step>
</process>

<success_criteria>
- [ ] Optional `--ref` is parsed and defaults to `main`
- [ ] Installed runtime and scope are resolved with existing precedence rules
- [ ] Installed `RELEASE.json` metadata is read when available
- [ ] Fork repo is cloned into a portable temp directory
- [ ] Target ref is resolved to an exact git commit
- [ ] Commit summary or migration note is shown before install
- [ ] Local installs trigger a global-vs-local confirmation
- [ ] Installer runs from the temp checkout source
- [ ] Update cache is cleared after install
- [ ] Restart reminder is shown
</success_criteria>
