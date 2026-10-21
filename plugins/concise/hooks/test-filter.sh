#!/bin/bash
# Prints the output filter settings for a Bash hook event as JSON, or {} when the command is not a test run. concise-ignore
#
#   Bypass:  NOFILTER=1 pytest tests/   (NOFILTER=1 anywhere in the command; a stdout redirect also bypasses)
#   Adjust:  FILTER_LINES=300 FILTER_PATTERN='FAIL|timeout' FILTER_CONTEXT=10 FILTER_TAIL=20 go test ./...
#   Defaults can also live in ~/.claude/test-filter.conf or ~/.codex/test-filter.conf.
set -uo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
session=$(jq -r '.session_id // empty | strings' <<<"$input")
[[ "$tool" == "Bash" && -n "$cmd" ]] || { echo '{}'; exit 0; }
[[ "$session" =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$ ]] || session=nosession

# NOFILTER=1 counts wherever it appears, quoted or escaped; a false match only skips filtering.
nofilter_re="(^|[[:space:];&|(])(export[[:space:]]+)?NOFILTER=1([[:space:];&|)]|$)"
dequoted=${cmd//[\'\"\\]/}
[[ "$dequoted" =~ $nofilter_re ]] && { echo '{}'; exit 0; }

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
unquoted=$(sed -E "s/'[^']*'/Q/g; s/\"([^\"\\\\]|\\\\.)*\"/Q/g" <<<"$cmd")
redirect_re='(^|[^0-9<>&])((1?>>?|&>>?)[[:space:]]*[^&[:space:]]|1?>&[[:space:]]*[^0-9[:space:]-])'
[[ "$unquoted" =~ $redirect_re ]] && { echo '{}'; exit 0; }

jq -cn --arg runner "$runner" --arg pattern "$pattern" --arg failurePattern "$default_pattern" \
  --arg lines "$FILTER_LINES" --arg context "$FILTER_CONTEXT" --arg tail "$FILTER_TAIL" --arg cmd "$cmd" --arg session "$session" \
  '{runner:$runner,pattern:$pattern,failurePattern:$failurePattern,lines:$lines,context:$context,tail:$tail,cmd:$cmd,session:$session}'
