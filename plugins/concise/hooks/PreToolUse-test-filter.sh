#!/bin/bash
# Claude Code / Codex PreToolUse hook (Bash): filters test-runner output. concise-ignore
#
#   Bypass:  NOFILTER=1 pytest tests/
#   Adjust:  FILTER_LINES=300 FILTER_PATTERN='FAIL|timeout' FILTER_CONTEXT=10 FILTER_TAIL=20 go test ./...
#   Defaults can also live in ~/.claude/test-filter.conf or ~/.codex/test-filter.conf.
#   Full log of the last run: /tmp/claude-test-last.log
set -uo pipefail

if [[ "${1:-}" == "run" ]]; then
  log=/tmp/claude-test-last.log
  bash -c "$TF_CMD" >"$log" 2>&1
  rc=$?
  total=$(wc -l <"$log" | tr -d ' ')
  matches=$(grep -c -E "$TF_PATTERN" "$log")
  shown=$(grep -A "$TF_CONTEXT" -E "$TF_PATTERN" "$log" | head -n "$TF_LINES")
  echo "[filtered] runner=$TF_RUNNER exit=$rc matched=$matches/$total lines (cap $TF_LINES)"
  echo "[filtered] full log: cat $log | bypass: NOFILTER=1 <cmd> | adjust: FILTER_LINES=300 FILTER_PATTERN='regex' <cmd>"
  [[ -n "$shown" ]] && printf '%s\n' "$shown"
  echo "[filtered] last $TF_TAIL lines:"
  tail -n "$TF_TAIL" "$log"
  exit "$rc"
fi

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
[[ "$tool" == "Bash" && -n "$cmd" ]] || { echo '{}'; exit 0; }

FILTER_LINES=100 FILTER_CONTEXT=5 FILTER_TAIL=5 FILTER_PATTERN="" NOFILTER=0
for conf in "$HOME/.claude/test-filter.conf" "$HOME/.codex/test-filter.conf"; do
  [[ -f "$conf" ]] && source "$conf"
done

knob_re="^[[:space:]]*(NOFILTER|FILTER_LINES|FILTER_PATTERN|FILTER_CONTEXT|FILTER_TAIL)=('[^']*'|\"[^\"]*\"|[^[:space:]]+)[[:space:]]+(.*)$"
while [[ "$cmd" =~ $knob_re ]]; do
  val=${BASH_REMATCH[2]}; val=${val#[\'\"]}; val=${val%[\'\"]}
  printf -v "${BASH_REMATCH[1]}" '%s' "$val"
  cmd=${BASH_REMATCH[3]}
done
[[ "$NOFILTER" == "1" ]] && { echo '{}'; exit 0; }

if   [[ "$cmd" =~ (^|[[:space:];&|])pytest([[:space:]]|$) ]]; then
  runner=pytest
  default_pattern='^(FAILED|ERROR|E {3}|_{3,}.* _{3,})'
  if [[ "$cmd" != *--tb* ]] && [[ "$cmd" == pytest || "$cmd" == pytest\ * ]]; then
    cmd="pytest -q --tb=short${cmd#pytest}"
  fi
elif [[ "$cmd" =~ (^|[[:space:];&|])go[[:space:]]+test([[:space:]]|$) ]]; then
  runner=go
  default_pattern='^(--- FAIL|FAIL|panic:|.+\.go:[0-9]+:[0-9]+: )'
elif [[ "$cmd" =~ (^|[[:space:];&|])(npm[[:space:]]+(run[[:space:]]+)?test|npx[[:space:]]+(jest|vitest)|jest|vitest)([[:space:]]|$) ]]; then
  runner=js
  default_pattern='^(FAIL|  ●|.*(Expected|Received|AssertionError|Error:))'
else
  echo '{}'; exit 0
fi
pattern=${FILTER_PATTERN:-$default_pattern}

self=$(realpath "${BASH_SOURCE[0]}")
wrapped="TF_CMD=$(printf %q "$cmd") TF_PATTERN=$(printf %q "$pattern") TF_LINES=$FILTER_LINES TF_CONTEXT=$FILTER_CONTEXT TF_TAIL=$FILTER_TAIL TF_RUNNER=$runner bash $(printf %q "$self") run"

jq -c --arg cmd "$wrapped" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:(.tool_input + {command:$cmd})}}' <<<"$input"
