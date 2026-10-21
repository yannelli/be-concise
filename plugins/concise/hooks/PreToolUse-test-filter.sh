#!/bin/bash
# Codex and omp PreToolUse hook (Bash): runs a test command through the output filter. concise-ignore
#
#   test-filter.sh decides whether the command is a test run and prints its settings.
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
  dir="$base/$session" log=""
  if private_dir "$base"; then
    # find never follows symlinks here; a log stays active.* until its run ends, so pruning skips it.
    find "$base" -mindepth 2 -maxdepth 2 -type f \( -name 'run.*' -mmin +1440 -o -name 'active.*' -mtime +7 \) -delete 2>/dev/null
    find "$base" -mindepth 1 -maxdepth 1 -type d -empty -mtime +7 -delete 2>/dev/null
    private_dir "$dir" && log=$(mktemp "$dir/active.XXXXXX" 2>/dev/null)
  fi
  [[ -n "$log" ]] || exec bash -c "$TF_CMD"
  bash -c "$TF_CMD" >"$log" 2>&1
  rc=$?
  done_log="$dir/run.${log##*/active.}"
  mv -n "$log" "$done_log" 2>/dev/null && [[ ! -e "$log" ]] && log=$done_log
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
self=$(realpath "${BASH_SOURCE[0]}")
settings=$(bash "$(dirname "$self")/test-filter.sh" <<<"$input")
runner=$(jq -r '.runner // empty' <<<"$settings" 2>/dev/null)
[[ -n "$runner" ]] || { echo '{}'; exit 0; }
field() { jq -r --arg key "$1" '.[$key]' <<<"$settings"; }
cmd=$(field cmd) pattern=$(field pattern) session=$(field session)
wrapped="TF_CMD=$(printf %q "$cmd") TF_PATTERN=$(printf %q "$pattern") TF_LINES=$(field lines) TF_CONTEXT=$(field context) TF_TAIL=$(field tail) TF_RUNNER=$runner TF_SESSION=$session bash $(printf %q "$self") run"

jq -c --arg cmd "$wrapped" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:(.tool_input + {command:$cmd})}}' <<<"$input"
