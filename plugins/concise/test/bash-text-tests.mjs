#!/usr/bin/env node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ok, bad, summary, withConfig, run, CHECK_EDIT, CHECK_BASH, assertDenied, assertAllowed, assertFlagged } from "./lib.mjs";
import { apiFields, extractTitle, maskHeredocs } from "../hooks/lib/pr-body.mjs";
import { gitCommitMessages } from "../hooks/lib/prose.mjs";
import { fileFlagPaths } from "../hooks/lib/shell-text.mjs";

const dirs = [];
let seq = 0;

function project(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "concise-bash-text-"));
  dirs.push(dir);
  // softFail is off here because a user config on the test machine can turn it on.
  withConfig(dir, { softFail: false, features: { aiWriting: { enabled: true, preset: "default" } }, ...extra });
  return dir;
}

const event = (dir, command, sid = `bash-text-${process.pid}-${++seq}`) => ({ tool_name: "Bash", tool_input: { command }, cwd: dir, session_id: sid });
const reasonOf = (result) => result.hookSpecificOutput?.permissionDecisionReason || result.systemMessage || "";
const DELVE = "We delve into the parser.";
const LONG = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} explains one part of the change in plain words.`).join("\n\n");

function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return ok(name);
  bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function includes(name, result, needle) {
  if (reasonOf(result).includes(needle)) return ok(name);
  bad(name, `expected ${JSON.stringify(needle)} in ${JSON.stringify(reasonOf(result)).slice(0, 300)}`);
}

console.log("\nbash text: gh api request bodies");

{
  const dir = project();
  writeFileSync(join(dir, "body.md"), `${DELVE}\n`);
  writeFileSync(join(dir, "req.json"), JSON.stringify({ tag_name: "v1", body: DELVE }));
  writeFileSync(join(dir, "bad.json"), "{not json");
  const api = (args) => run(CHECK_BASH, event(dir, `gh api repos/o/r/issues/1/comments ${args}`));
  const raw = api(`-f body='${DELVE}'`);
  assertDenied("gh api -f body is read", raw);
  includes("the finding names the API request body", raw, "in API request body");
  assertDenied("a quoted -f 'key=value' is read", api(`-f 'body=${DELVE}'`));
  assertDenied("--raw-field=key=value is read", api(`--raw-field=title="${DELVE}"`));
  assertDenied("-F message is read", api(`-F message="${DELVE}"`));
  assertDenied("--field description is read", api(`--field "description=${DELVE}"`));
  assertDenied("-F key=@file reads the file", api("-F body=@body.md"));
  assertDenied("-F key=@- reads the heredoc", api(`-F body=@- <<'EOF'\n${DELVE}\nEOF`));
  assertDenied("a heredoc inside a field value is read", api(`-f body="$(cat <<'EOF'\n${DELVE}\nEOF\n)"`));
  assertDenied("--input reads the JSON file", api("--input req.json"));
  assertDenied("--input - reads JSON from the heredoc", api(`--input - <<'EOF'\n{"title": "${DELVE}"}\nEOF`));
  assertAllowed("a clean field passes", api("-f body='The parser keeps the header field.'"));
  assertAllowed("a field outside the text keys is skipped", api(`-f state='${DELVE}'`));
  assertAllowed("an --input file that is not JSON is skipped", api("--input bad.json"));
  assertAllowed("API bodies skip the PR prose limit", api(`-f body="${LONG}"`));
}

{
  // A bypass phrase answers only once config loads, so an empty result shows the early exit.
  const dir = project({ bypass: { phrases: ["repos/"] } });
  eq("a gh api GET exits before it loads config", run(CHECK_BASH, event(dir, "gh api repos/o/r/pulls --jq '.[].title'")), {});
  includes("a call with a text field loads config", run(CHECK_BASH, event(dir, "gh api repos/o/r/issues -f title='Plain words'")), "Allowed by bypass phrase");
}

{
  const dir = project();
  const write = "cat > body.md <<'EOF'\nWe delve into it.\nEOF";
  const consumed = `${write}\ngh api repos/o/r/issues/1/comments -F body=@body.md`;
  assertDenied("check-edit reads a heredoc file on its own", run(CHECK_EDIT, event(dir, write)));
  assertAllowed("check-edit leaves a file that gh api -F consumes to check-bash", run(CHECK_EDIT, event(dir, consumed)));
  assertDenied("check-bash reads that file", run(CHECK_BASH, event(dir, consumed)));
  const json = `cat > req.json <<'EOF'\n{"body": "We delve into it."}\nEOF\ngh api repos/o/r/issues --input req.json`;
  assertDenied("check-bash reads a heredoc JSON file that --input consumes", run(CHECK_BASH, event(dir, json)));
}

console.log("\nbash text: titles");

{
  const dir = project();
  const bash = (command) => run(CHECK_BASH, event(dir, command));
  const both = bash(`gh pr create --title "We delve into the parser" --body "We delve into the lexer."`);
  assertDenied("a PR title and body are read", both);
  includes("the deny names the title", both, "in PR title.");
  includes("the same deny names the body", both, "in PR body.");
  assertDenied("a title with no body is read", bash(`gh pr edit 3 --title "We delve into the parser"`));
  assertDenied("an issue -t title is read", bash(`gh issue create -t 'We delve into the parser' --body "Steps below."`));
  includes("a merge subject is read", bash(`gh pr merge 3 --squash --subject "We delve into the parser"`), "in merge subject.");
  includes("a release title is read", bash(`gh release edit v1 --title "We delve into the release"`), "in release title.");
  assertAllowed("a long release body with a clean title passes", bash(`gh release create v1 --title "v1.0.0" --notes "${LONG}"`));
  assertAllowed("the prose limit counts only the body", bash(`gh pr create --title "One. Two. Three. Four. Five." --body "Short body."`));
  assertAllowed("concise-ignore in the title skips the scan", bash(`gh pr create --title "We delve into it concise-ignore" --body "Adds the parser."`));
}

{
  const dir = project({ features: { aiWriting: { enabled: true, preset: "default", mode: "ask" } } });
  const asked = run(CHECK_BASH, event(dir, `gh pr create --title "We delve into the parser" --body "We delve into the lexer."`));
  eq("ask mode asks once for the title and body", asked.hookSpecificOutput?.permissionDecision, "ask");
  includes("the ask names the title", asked, "in PR title.");
  includes("the ask names the body", asked, "in PR body.");
}

{
  const dir = project();
  const sid = `bash-text-retry-${process.pid}`;
  const pr = (title) => run(CHECK_BASH, event(dir, `gh pr create --base main --title "${title}" --body "Adds the parser."`, sid));
  assertDenied("a flagged title is held", pr("We delve into the parser"));
  assertDenied("a revised title on the same PR is held again", pr("We delve into the lexer"));
  assertFlagged("title revisions share one retry counter", pr("We delve into the tokens"));
}

console.log("\nbash text: jj and hg messages");

{
  const dir = project();
  writeFileSync(join(dir, "msg.txt"), `${DELVE}\n`);
  const bash = (command) => run(CHECK_BASH, event(dir, command));
  const jj = bash(`jj describe -m "${DELVE}"`);
  assertDenied("jj describe -m is read", jj);
  includes("a jj message is a commit message", jj, "in commit message");
  assertDenied("jj new --message= is read", bash(`jj new --message="${DELVE}"`));
  assertDenied("hg commit -m is read", bash(`hg commit -m "${DELVE}"`));
  assertDenied("hg ci -l file is read", bash("hg ci -l msg.txt"));
  assertDenied("hg commit --logfile - reads the heredoc", bash(`hg commit --logfile - <<'EOF'\n${DELVE}\nEOF`));
  assertAllowed("a clean jj message passes", bash('jj commit -m "Fix the parser header field"'));
  assertAllowed("jj log carries no message", bash("jj log -r @"));
}

console.log("\nbash text: helpers");

eq("apiFields reads each field form", apiFields(`gh api x -f body='a b' -f "title=c" --raw-field=description="d" -F message=e --field=body=f -f state=g`), ["a b", "c", "d", "e", "f"]);
eq("apiFields reads every gh api call", apiFields("gh api x -f body=one && gh api y -f body=two"), ["one", "two"]);
eq("apiFields reads @- from its own heredoc", apiFields("cat > a.md <<'EOF'\nfirst\nEOF\ngh api x -F body=@- <<'EOF'\nsecond\nEOF"), ["second"]);
eq("apiFields takes top-level JSON strings", apiFields(`gh api x --input - <<'EOF'\n{"body": "a", "title": 3, "head": "b", "comments": [{"body": "c"}]}\nEOF`), ["a"]);
eq("apiFields keeps a raw -f @ value as text", apiFields("gh api x -f body=@notes.md"), ["@notes.md"]);
eq("apiFields skips a missing @file", apiFields("gh api x -F body=@/nonexistent.md"), []);
eq("apiFields reads nothing from a GET", apiFields("gh api repos/o/r/pulls --jq '.[].title'"), []);
eq("apiFields skips other commands", apiFields("gh pr view 3"), []);
eq("extractTitle reads --title", extractTitle('gh pr create --title "Fix it" --body x'), "Fix it");
eq("extractTitle reads a single-quoted -t", extractTitle("gh issue create -t 'Fix it'"), "Fix it");
eq("extractTitle reads --subject=", extractTitle('gh pr merge 3 --subject="feat: x"'), "feat: x");
eq("extractTitle skips a flag inside a heredoc", extractTitle(`gh pr create --body "$(cat <<'EOF'\nUse --title "x".\nEOF\n)" --title "Real"`), "Real");
eq("extractTitle returns null without a title", extractTitle("gh pr comment 3 --body x"), null);
{
  const { masked, bodyIn } = maskHeredocs("a <<'EOF'\nx\nEOF\nb");
  eq("maskHeredocs swaps a heredoc for a placeholder", [masked, bodyIn(masked), bodyIn("b")], ["a {{concise-heredoc-0}}\nb", "x", null]);
}
eq("fileFlagPaths reads gh api @files and --input", fileFlagPaths("gh api x -F body=@notes.md -F title=plain --input req.json -f body=@raw.md"), ["notes.md", "req.json"]);
eq("fileFlagPaths needs a space or = after a long flag", fileFlagPaths("tool --files a --inputs b"), []);
eq("gitCommitMessages reads jj -R repo desc", gitCommitMessages('jj -R ../repo desc -m "x"'), ["x"]);
eq("gitCommitMessages reads jj split", gitCommitMessages("jj split -m 'first part'"), ["first part"]);
eq("gitCommitMessages reads hg -l -", gitCommitMessages("hg commit -l - <<'EOF'\nbody\nEOF"), ["body"]);
eq("gitCommitMessages skips jj log", gitCommitMessages('jj log -T "x"'), []);
eq("git tag -l reads no message", gitCommitMessages("git tag -l 'v1*'"), []);

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
