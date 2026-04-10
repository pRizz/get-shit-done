<purpose>
Display the installed GSD version, release commit, commit date, runtime, and install scope for the invoking runtime.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="resolve_install_target">
Detect the active GSD install using the same runtime/config precedence as `update.md`.

First, derive `PREFERRED_CONFIG_DIR` and `PREFERRED_RUNTIME` from the invoking prompt's `execution_context` path:
- If the path contains `/get-shit-done/workflows/version.md`, strip that suffix and store the remainder as `PREFERRED_CONFIG_DIR`
- Path contains `/.codex/` -> `codex`
- Path contains `/.gemini/` -> `gemini`
- Path contains `/.config/kilo/` or `/.kilo/`, or `PREFERRED_CONFIG_DIR` contains `kilo.json` / `kilo.jsonc` -> `kilo`
- Path contains `/.config/opencode/` or `/.opencode/`, or `PREFERRED_CONFIG_DIR` contains `opencode.json` / `opencode.jsonc` -> `opencode`
- Otherwise -> `claude`

Use `PREFERRED_CONFIG_DIR` when available so custom `--config-dir` installs are checked before default locations.
Use `PREFERRED_RUNTIME` as the first runtime checked so `gsd-version` targets the runtime that invoked it.

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
- Line 4 = resolved config directory
</step>

<step name="read_release_metadata">
Read the local release metadata from the resolved install.

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

display_version="$(printf '%s\n' "$release_output" | sed -n '1p')"
git_head="$(printf '%s\n' "$release_output" | sed -n '2p')"
commit_date="$(printf '%s\n' "$release_output" | sed -n '3p')"
```

This step must stay compatible with macOS default Bash 3.2. Do not use `mapfile` or `readarray` here.

Parse output from `release_output` with portable shell logic:
- `display_version` = line 1
- `git_head` = line 2 or `unavailable`
- `commit_date` = line 3 or `unavailable`
</step>

<step name="display_output">
Output exactly these lines:

```text
Version: {display_version}
Commit: {git_head_or_unavailable}
Commit Date: {commit_date_or_unavailable}
Runtime: {target_runtime}
Install Scope: {install_scope}
```

If commit metadata is unavailable, add one final line:

```text
Note: Commit metadata unavailable. Rerun install or use gsd-update to refresh install metadata.
```
</step>

</process>
