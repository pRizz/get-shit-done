#!/usr/bin/env bash
# gsd-hook-version: {{GSD_VERSION}}
# gsd-phase-boundary.sh — PostToolUse hook: detect .planning/ file writes
# Injects a reminder when planning files are modified outside normal workflow.
# Uses Node.js for JSON parsing (always available in GSD projects, no jq dependency).
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

INPUT=$(cat)

# Extract file_path from JSON using Node (handles escaping correctly)
FILE=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path||'')}catch{}})" 2>/dev/null)

if [[ "$FILE" == *.planning/* ]] || [[ "$FILE" == .planning/* ]]; then
  MESSAGE=".planning/ file modified: $FILE
Check: Should STATE.md be updated to reflect this change?"
  emit_hook_context "PostToolUse" "$MESSAGE"
  exit 0
fi

emit_hook_success
exit 0
