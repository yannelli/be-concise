#!/usr/bin/env node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad, summary, withConfig, run, CHECK_EDIT, CHECK_BASH, assertDenied, assertAllowed } from "./lib.mjs";
import { gitCommitMessages } from "../hooks/lib/prose.mjs";
import { extractBody } from "../hooks/lib/pr-body.mjs";
import { heredocWrites, fileFlagPaths, readMessageFile, segmentFrom } from "../hooks/lib/shell-text.mjs";
import { checkText } from "../tools/check.mjs";

const CHECK_MCP = join(ROOT, "hooks", "check-mcp.mjs");
const ZWSP = "\u200B";
const dirs = [];
let seq = 0;

function project(aiWriting = {}, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "concise-gaps-"));
  dirs.push(dir);
  // softFail is off here because a user config on the test machine can turn it on.
  withConfig(dir, { softFail: false, features: { aiWriting: { enabled: true, preset: "default", ...aiWriting } }, ...extra });
  return dir;
}

const event = (dir, tool_name, tool_input) => ({ tool_name, tool_input, cwd: dir, session_id: `gaps-${process.pid}-${++seq}` });
const reasonOf = (result) => result.hookSpecificOutput?.permissionDecisionReason || result.systemMessage || "";

function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return ok(name);
  bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function includes(name, result, needle) {
  if (reasonOf(result).includes(needle)) return ok(name);
  bad(name, `expected ${JSON.stringify(needle)} in ${JSON.stringify(reasonOf(result)).slice(0, 300)}`);
}

console.log("\nhook gaps: the code scope");

{
  const dir = project();
  const ts = (content) => run(CHECK_EDIT, event(dir, "Write", { file_path: join(dir, "a.ts"), content }));
  const hit = ts(`export const label = "zero${ZWSP}width";\n`);
  assertDenied("a zero-width space in a string literal is flagged", hit);
  includes("the finding names hidden-characters", hit, "[concise:hidden-characters]");
  assertAllowed("a code file without hidden characters passes", ts('export const label = "plain";\n'));
  assertDenied("an unknown extension is scanned whole", run(CHECK_EDIT, event(dir, "Write", { file_path: join(dir, "a.json"), content: `{"a": "b\u202Ec"}\n` })));
  assertAllowed("prose packs stay out of code text", ts('export const note = "We delve into it.";\n'));
}

{
  const dir = project({}, { features: { aiWriting: { enabled: false }, dictionary: { enabled: true, mode: "deny", entries: [
    { id: "no-foo", match: "exact", value: "fooBar", fix: "use bazQux", scopes: ["code"] },
    { id: "comment-only", match: "exact", value: "fooBar", fix: "rename" },
  ] } } });
  const result = run(CHECK_EDIT, event(dir, "Write", { file_path: join(dir, "b.js"), content: "const fooBar = 1;\n" }));
  assertDenied("a dictionary entry scoped to code flags an identifier", result);
  includes("only the code-scoped entry reports", result, "no-foo");
  if (reasonOf(result).includes("comment-only")) bad("a default-scoped entry skips code text", reasonOf(result));
  else ok("a default-scoped entry skips code text");
}

{
  const dir = project();
  const found = await checkText({ text: `const a = "x${ZWSP}y";\n`, scope: "code", cwd: dir, env: {} });
  eq("check_text takes the code scope", found.findings.map((f) => f.category), ["hidden-characters"]);
  eq("check_text code scope uses a code path", found.path, "check.js");
}

console.log("\nhook gaps: commit messages");

{
  const dir = project();
  writeFileSync(join(dir, "msg.txt"), "We delve into the parser.\n");
  const bash = (command) => run(CHECK_BASH, event(dir, "Bash", { command }));
  assertDenied("git -C dir commit is read", bash(`git -C ${dir} commit -m "We delve into the parser."`));
  assertDenied("git commit -F file is read", bash("git commit -F msg.txt"));
  assertDenied("git commit -F - reads the heredoc", bash("git commit -F - <<'EOF'\nWe delve into the parser.\nEOF"));
  assertDenied("a heredoc written and then passed to -F is read", bash("cat > m2.txt <<'EOF'\nWe delve into it.\nEOF\ngit commit -F m2.txt"));
  assertDenied("a --trailer co-author is flagged", bash('git commit -m "fix parser" --trailer "Co-authored-by: Claude <noreply@anthropic.com>"'));
  assertDenied("git tag -m is read", bash('git tag -a v1 -m "We delve into the release."'));
  assertDenied("git merge -m is read", bash('git merge topic -m "We delve into the merge."'));
  assertDenied("a PowerShell commit is read", run(CHECK_BASH, event(dir, "PowerShell", { command: 'git commit -m "We delve into it."' })));
  assertAllowed("git revert -m 1 carries no message", bash("git revert -m 1 HEAD"));
}

eq("--trailer=key=value becomes key: value", gitCommitMessages('git commit -m "x" --trailer=Assisted-by=Codex'), ["x", "Assisted-by: Codex"]);
eq("a missing -F file adds nothing", gitCommitMessages("git commit -F /nonexistent/msg.txt"), []);
eq("-F before the git command is ignored", gitCommitMessages('grep -F foo bar && git commit -m "y"'), ["y"]);
eq("segmentFrom stops at && outside quotes", segmentFrom('a "x && y" && b', 0), 'a "x && y" ');
eq("segmentFrom keeps an escaped quote", segmentFrom('a "x \\" ; y"; b', 0), 'a "x \\" ; y"');

console.log("\nhook gaps: gh bodies");

{
  const dir = project();
  writeFileSync(join(dir, "body.md"), "We delve into the parser.\n");
  const bash = (command) => run(CHECK_BASH, event(dir, "Bash", { command }));
  assertDenied("gh pr review -b is read", bash('gh pr review 3 --comment -b "We delve into the parser."'));
  const notes = bash('gh release create v1 --notes "We delve into the release."');
  assertDenied("gh release --notes is read", notes);
  includes("release notes are labeled", notes, "release notes");
  assertDenied("gh pr create --body-file is read from disk", bash("gh pr create --title x --body-file body.md"));
  const long = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} explains one part of the release in plain words.`).join("\n\n");
  assertAllowed("release notes skip the PR prose limit", bash(`gh release create v1 --notes "${long}"`));
  const written = "cat > /tmp/concise-gaps-body.md <<'EOF'\nWe delve into it.\nEOF\ngh pr create --title x --body-file /tmp/concise-gaps-body.md";
  assertDenied("a heredoc body file in the same command is read by check-bash", bash(written));
  assertAllowed("check-edit leaves a consumed body file to check-bash", run(CHECK_EDIT, event(dir, "Bash", { command: written })));
}

eq("extractBody reads -n for release notes", extractBody("gh release create v1 -n 'short notes'"), "short notes");
eq("extractBody returns null for a missing body file", extractBody("gh pr create -F /nonexistent.md"), null);

console.log("\nhook gaps: heredoc file writes");

{
  const dir = project();
  const bash = (command) => run(CHECK_EDIT, event(dir, "Bash", { command }));
  assertDenied("cat > file <<EOF is read", bash("cat > notes.md <<'EOF'\nWe delve into it.\nEOF"));
  assertDenied("cat <<EOF > file is read", bash("cat <<'EOF' > notes.md\nWe delve into it.\nEOF"));
  assertDenied("tee file <<EOF is read", bash("tee notes.md <<EOF\nWe delve into it.\nEOF"));
  assertDenied("cat <<EOF | tee -a file is read", bash("cat <<EOF | tee -a notes.md\nWe delve into it.\nEOF"));
  assertAllowed("a script's output redirect is not a heredoc write", bash("node - <<'EOF' > out.md\nconsole.log('We delve');\nEOF"));
  assertAllowed("a heredoc to /dev/null is skipped", bash("cat > /dev/null <<'EOF'\nWe delve into it.\nEOF"));
}

eq("heredocWrites reads append and the path", heredocWrites("cat >> 'a b.md' <<EOF\nx\nEOF").map((w) => [w.path, w.append, w.body]), [["a b.md", true, "x"]]);
eq("heredocWrites skips a plain command", heredocWrites("ls -la"), []);
eq("fileFlagPaths finds body and notes files", fileFlagPaths("gh pr create --body-file a.md && gh release create v1 --notes-file=b.md"), ["a.md", "b.md"]);
eq("readMessageFile returns null for -", readMessageFile("-"), null);

console.log("\nhook gaps: notebook cells");

{
  const dir = project();
  const notebook = join(dir, "n.ipynb");
  writeFileSync(notebook, JSON.stringify({ cells: [{ id: "m1", cell_type: "markdown", source: [] }], metadata: { language_info: { file_extension: ".py" } } }));
  const cell = (input) => run(CHECK_EDIT, event(dir, "NotebookEdit", { notebook_path: notebook, ...input }));
  assertDenied("a markdown cell is read as prose", cell({ cell_id: "m2", cell_type: "markdown", new_source: "We delve into the data." }));
  assertDenied("the cell type comes from the notebook when it is left out", cell({ cell_id: "m1", new_source: "We delve into the data." }));
  assertDenied("a code cell comment is read", cell({ cell_id: "c1", cell_type: "code", new_source: "# We delve into the data.\nx = 1\n" }));
  assertAllowed("a code cell string is not prose", cell({ cell_id: "c1", cell_type: "code", new_source: 'x = "We delve into the data."\n' }));
  assertAllowed("a deleted cell is skipped", cell({ cell_id: "m1", edit_mode: "delete", new_source: "We delve." }));
  assertAllowed("a missing notebook falls back to code rules", run(CHECK_EDIT, event(dir, "NotebookEdit", { notebook_path: join(dir, "none.ipynb"), new_source: 'x = "We delve."' })));
}

console.log("\nhook gaps: MCP tool bodies");

{
  const dir = project();
  const mcp = (tool, input) => run(CHECK_MCP, event(dir, tool, input));
  const pr = mcp("mcp__github__create_pull_request", { title: "x", body: "We delve into the parser and fix it." });
  assertDenied("a GitHub MCP PR body is read", pr);
  includes("the label names the server and tool", pr, "github create_pull_request body");
  assertDenied("a chat message tool's text is read", mcp("mcp__slack__post_message", { channel: "c", text: "We delve into the outage today." }));
  assertDenied("an issue tool's description is read", mcp("mcp__linear__create_issue", { description: "We delve into the outage today." }));
  assertAllowed("a description on another tool is skipped", mcp("mcp__runpod__create_template", { description: "We delve into the outage today." }));
  assertAllowed("concise's own tools are skipped", mcp("mcp__plugin_concise_concise__concise_check_text", { text: "We delve into it at length today." }));
  assertAllowed("a short body is skipped", mcp("mcp__github__add_issue_comment", { body: "We delve." }));
  assertAllowed("concise-ignore skips the body", mcp("mcp__github__add_issue_comment", { body: "We delve into it. concise-ignore" }));
  assertAllowed("a clean body passes", mcp("mcp__github__add_issue_comment", { body: "The parser now keeps the header field." }));
  assertAllowed("a non-MCP tool is skipped", mcp("Bash", { body: "We delve into the parser and fix it." }));
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
