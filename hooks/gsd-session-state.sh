#!/usr/bin/env bash
# gsd-hook-version: {{GSD_VERSION}}
# gsd-session-state.sh — SessionStart hook: inject project state reminder
# Injects STATE.md head on every session start for orientation.
#
# OPT-IN: This hook is a no-op unless config.json has hooks.community: true.
# Enable with: "hooks": { "community": true } in .planning/config.json

emit_hook_success() {
  printf '{"continue":true}\n'
}

emit_hook_context() {
  local event_name="$1"
  local message="$2"
  node -e 'const eventName=process.argv[1]; const message=process.argv[2]; process.stdout.write(JSON.stringify({continue:true,hookSpecificOutput:{hookEventName:eventName,additionalContext:message}})+"\n");' "$event_name" "$message"
}

# Check opt-in config — emit neutral success if not enabled
if [ -f .planning/config.json ]; then
  ENABLED=$(node -e "try{const c=require('./.planning/config.json');process.stdout.write(c.hooks?.community===true?'1':'0')}catch{process.stdout.write('0')}" 2>/dev/null)
  if [ "$ENABLED" != "1" ]; then emit_hook_success; exit 0; fi
else
  emit_hook_success
  exit 0
fi

MESSAGE='## Project State Reminder
'

if [ -f .planning/STATE.md ]; then
  STATE_HEAD=$(head -20 .planning/STATE.md)
  MESSAGE="${MESSAGE}
STATE.md exists - check for blockers and current phase.
${STATE_HEAD}
"
else
  MESSAGE="${MESSAGE}
No .planning/ found - suggest /gsd-new-project if starting new work.
"
fi

if [ -f .planning/config.json ]; then
  MODE=$(grep -o '"mode"[[:space:]]*:[[:space:]]*"[^"]*"' .planning/config.json 2>/dev/null || echo '"mode": "unknown"')
  MESSAGE="${MESSAGE}
Config: $MODE"
fi

emit_hook_context "SessionStart" "$MESSAGE"
exit 0
