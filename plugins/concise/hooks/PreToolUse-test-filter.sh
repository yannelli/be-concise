#!/bin/bash
# Claude Code / Codex PreToolUse hook (Bash): filters test-runner output. concise-ignore
#
#   Bypass:  NOFILTER=1 pytest tests/   (NOFILTER=1 anywhere in the command; a stdout redirect also bypasses)
#   Adjust:  FILTER_LINES=300 FILTER_PATTERN='FAIL|timeout' FILTER_CONTEXT=10 FILTER_TAIL=20 go test ./...
#   Defaults can also live in ~/.claude/test-filter.conf or ~/.codex/test-filter.conf.
#   Full log: a per-run file under $TMPDIR/concise-test-filter-<uid>/<session>/, printed with each run.
set -uo pipefail

# Refuses a base dir that is a symlink or owned by someone else, so a shared /tmp cannot redirect logs.
private_dir() {
  mkdir -p -m 700 "$1" 2>/dev/null && [[ -d "$1" && ! -L "$1" && -O "$1" ]]
}

if [[ "${1:-}" == "run" ]]; then
  session=${TF_SESSION:-}
  [[ "$session" =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$ ]] || session=nosession
  tmp=${TMPDIR:-/tmp}; base="${tmp%/}/concise-test-filter-$(id -u)"
  log=""
  if private_dir "$base"; then
    find "$base" -mindepth 1 -mtime +7 -delete 2>/dev/null
    private_dir "$base/$session" && log=$(mktemp "$base/$session/run.XXXXXX" 2>/dev/null)
  fi
  [[ -n "$log" ]] || log=$(mktemp "${tmp%/}/concise-test-filter.XXXXXX" 2>/dev/null) || exec bash -c "$TF_CMD"
  bash -c "$TF_CMD" >"$log" 2>&1
  rc=$?
  [[ -d "$base/$session" ]] && ls -t "$base/$session"/run.* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
  if [[ ! -s "$log" ]]; then
    rm -f "$log"
    exit "$rc"
  fi
  total=$(wc -l <"$log" | tr -d ' ')
  matches=$(grep -c -E "$TF_PATTERN" "$log")
  shown=$(grep -A "$TF_CONTEXT" -E "$TF_PATTERN" "$log" | head -n "$TF_LINES")
  echo "[filtered] runner=$TF_RUNNER exit=$rc matched=$matches/$total lines (cap $TF_LINES)"
  echo "[filtered] full log: cat $(printf %q "$log") | bypass: NOFILTER=1 <cmd> | adjust: FILTER_LINES=300 FILTER_PATTERN='regex' <cmd>"
  [[ -n "$shown" ]] && printf '%s\n' "$shown"
  echo "[filtered] last $TF_TAIL lines:"
  tail -n "$TF_TAIL" "$log"
  exit "$rc"
fi

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
session=$(jq -r '.session_id // empty | strings' <<<"$input")
[[ "$tool" == "Bash" && -n "$cmd" ]] || { echo '{}'; exit 0; }
[[ "$session" =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$ ]] || session=nosession

# NOFILTER=1 counts wherever it appears (after cd, &&, export); a false match only skips filtering.
nofilter_re="(^|[[:space:];&|(])(export[[:space:]]+)?NOFILTER=(1|'1'|\"1\")([[:space:];&|)]|$)"
[[ "$cmd" =~ $nofilter_re ]] && { echo '{}'; exit 0; }

FILTER_LINES=100 FILTER_CONTEXT=5 FILTER_TAIL=5 FILTER_PATTERN="" NOFILTER=0
for conf in "${HOME:-}/.claude/test-filter.conf" "${HOME:-}/.codex/test-filter.conf"; do
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

# Output sent to a file never reaches the agent, so filtering it would only print an empty or stranger log.
unquoted=$(sed -E "s/'[^']*'//g; s/\"([^\"\\\\]|\\\\.)*\"//g" <<<"$cmd")
redirect_re='(^|[^0-9<>&])(1?>>?|&>>?)[[:space:]]*[^&[:space:]]'
[[ "$unquoted" =~ $redirect_re ]] && { echo '{}'; exit 0; }

if [[ "${1:-}" == "settings" ]]; then
  jq -cn --arg runner "$runner" --arg pattern "$pattern" --arg failurePattern "$default_pattern" \
    --arg lines "$FILTER_LINES" --arg context "$FILTER_CONTEXT" --arg tail "$FILTER_TAIL" \
    '{runner:$runner,pattern:$pattern,failurePattern:$failurePattern,lines:$lines,context:$context,tail:$tail}'
  exit 0
fi

self=$(realpath "${BASH_SOURCE[0]}")
wrapped="TF_CMD=$(printf %q "$cmd") TF_PATTERN=$(printf %q "$pattern") TF_LINES=$FILTER_LINES TF_CONTEXT=$FILTER_CONTEXT TF_TAIL=$FILTER_TAIL TF_RUNNER=$runner TF_SESSION=$session bash $(printf %q "$self") run"

jq -c --arg cmd "$wrapped" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:(.tool_input + {command:$cmd})}}' <<<"$input"
