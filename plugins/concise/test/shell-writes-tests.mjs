#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad, run, summary, withConfig } from "./lib.mjs";
import { assertBlocked, assertEmpty, includes, reasonOf } from "./features-lib.mjs";

const HOOK = join(ROOT, "hooks", "check-shell-writes.mjs");
// The user's concise and git config stay out of the hook and the fixture repos.
const QUIET = { HOME: "", USERPROFILE: "", XDG_CONFIG_HOME: "", BEC_MONITOR_DISABLED: "1" };
const GIT_ENV = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))), ...QUIET, GIT_CONFIG_NOSYSTEM: "1" };
const DELVE = "We delve into it.\n";
const dirs = [];
let seq = 0;

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, env: GIT_ENV, stdio: "ignore" });
const hook = (input) => run(HOOK, input, QUIET);

function check(name, condition, detail) {
  if (condition) return ok(name);
  bad(name, JSON.stringify(detail).slice(0, 400));
}

function lacks(name, result, needle) {
  check(name, !reasonOf(result).includes(needle), reasonOf(result));
}

function write(dir, name, text) {
  const path = join(dir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

function tempDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "concise-shell-writes-")));
  dirs.push(dir);
  return dir;
}

/** A repo with the project config and `files` committed, so only later writes show as changes. */
function repo(config = {}, files = {}) {
  const dir = tempDir();
  withConfig(dir, { softFail: false, features: { aiWriting: { enabled: true, preset: "default" } }, ...config });
  git(dir, "init", "-q");
  git(dir, "config", "user.name", "Concise Test");
  git(dir, "config", "user.email", "test@example.test");
  for (const [name, text] of Object.entries({ "base.md": "Plain base text.\n", ...files })) write(dir, name, text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

const event = (cwd, command, extra = {}) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Bash",
  tool_input: { command },
  tool_response: { stdout: "", stderr: "", interrupted: false },
  tool_use_id: `toolu_${++seq}`,
  cwd,
  session_id: `shell-writes-${process.pid}-${seq}`,
  duration_ms: 200,
  ...extra,
});

console.log("\ncheck-shell-writes (files a shell command changed)");

{
  const dir = repo();
  const path = write(dir, "notes.md", DELVE);
  const result = hook(event(dir, "python gen.py"));
  assertBlocked("a new untracked .md file is reported", result);
  includes("the report names the file and the finding", result, `[concise] 1 AI writing pattern in ${path}.\n[concise:vocabulary] 1 match at line 1: "delve"`);
  includes("the report names the reference", result, "Fix it with Edit (read ");
  check("the report ends with the fix", reasonOf(result).endsWith("or add concise-ignore on the line to keep it."), reasonOf(result));
}

{
  const dir = repo({}, { "guide.md": "We delve into the old parser.\n" });
  write(dir, "guide.md", "We delve into the old parser.\nWe delve into the new parser.\n");
  const result = hook(event(dir, "sed -i '$a We delve into the new parser.' guide.md"));
  includes("only the added line of a tracked file is reported", result, "[concise] 1 AI writing pattern in");
  includes("the line number counts from the top of the file", result, "1 match at line 2:");
  const globbed = repo({}, { "a[1].md": "Plain text.\n", "a1.md": "Plain text.\n" });
  write(globbed, "a[1].md", "Plain text, changed.\n");
  write(globbed, "a1.md", `Plain text.\n${DELVE}`);
  lacks("a file name with glob characters reads only its own diff", hook(event(globbed, "python gen.py")), `in ${join(globbed, "a[1].md")}`);
}

{
  const dir = repo();
  const path = write(dir, "old.md", DELVE);
  const minuteAgo = (Date.now() - 60_000) / 1000;
  utimesSync(path, minuteAgo, minuteAgo);
  assertEmpty("a file changed before the command started is skipped", hook(event(dir, "ls", { duration_ms: 1000 })));
  assertBlocked("a long command's window reaches back to it", hook(event(dir, "make docs", { duration_ms: 120_000 })));
}

{
  const command = "cat > notes.md <<'EOF'\nWe delve into it.\nEOF";
  const dir = repo();
  write(dir, "notes.md", DELVE);
  assertEmpty("a heredoc write is left to check-edit", hook(event(dir, command)));
  const off = repo({ scan: { heredocWrites: false } });
  write(off, "notes.md", DELVE);
  assertBlocked("with scan.heredocWrites off, the heredoc write is scanned here", hook(event(off, command)));
  const linked = repo();
  write(linked, "notes.md", DELVE);
  const link = join(tempDir(), "link");
  symlinkSync(linked, link, "junction");
  assertEmpty("a heredoc write through a symlinked cwd is still skipped", hook(event(link, command)));
}

{
  const dir = repo();
  write(dir, "notes.md", DELVE);
  const guide = write(dir, "docs/guide.md", DELVE);
  // loadConfig reads the project config from cwd only.
  withConfig(join(dir, "docs"), { softFail: false, features: { aiWriting: { enabled: true, preset: "default" } } });
  const result = hook(event(join(dir, "docs"), "cat > ../notes.md <<'EOF'\nWe delve into it.\nEOF\npython gen.py"));
  includes("a command run in a subdirectory sees the whole repo", result, guide);
  lacks("a heredoc path relative to that subdirectory is skipped", result, join(dir, "notes.md"));
}

{
  const dir = repo();
  write(dir, "body.md", DELVE);
  assertEmpty("a --body-file path is left to check-bash", hook(event(dir, "gh pr create --title x --body-file body.md")));
  const patched = repo();
  write(patched, "patched.md", DELVE);
  const patch = "apply_patch <<'PATCH'\n*** Begin Patch\n*** Add File: patched.md\n+We delve into it.\n*** End Patch\nPATCH";
  assertEmpty("a file an apply_patch in the command wrote is left to check-edit", hook(event(patched, patch)));
}

{
  const dir = repo();
  write(dir, "notes.md", DELVE);
  const input = event(dir, "python gen.py");
  assertBlocked("the first run reports the finding", hook(input));
  assertEmpty("the same finding is not reported twice in a session", hook(input));
  write(dir, "notes.md", `${DELVE}We delve into the docs.\n`);
  const next = hook(input);
  includes("a new finding in the same file is reported", next, "[concise] 1 AI writing pattern in");
  includes("the new finding is the only one", next, "1 match at line 2:");
}

{
  const off = repo({ scan: { shellWrites: false } });
  write(off, "notes.md", DELVE);
  assertEmpty("scan.shellWrites false returns {}", hook(event(off, "python gen.py")));
  const plain = repo({ features: { aiWriting: { enabled: false } } });
  write(plain, "notes.md", DELVE);
  assertEmpty("no style feature on returns {}", hook(event(plain, "python gen.py")));
  const outside = tempDir();
  withConfig(outside, { softFail: false, features: { aiWriting: { enabled: true } } });
  write(outside, "notes.md", DELVE);
  assertEmpty("a directory outside git returns {}", hook(event(outside, "python gen.py")));
}

for (const [name, file, text, committed] of [
  ["a gitignored file is skipped", "ignored.md", DELVE, { ".gitignore": "ignored.md\n" }],
  ["a binary file is skipped", "data.md", Buffer.from(`${DELVE}\0`)],
  ["a file under ignoreGlobs is skipped", "node_modules/pkg/readme.md", DELVE],
  ["an agent instruction file is skipped", "CLAUDE.md", DELVE],
  ["concise-ignore-file skips the file", "marked.md", `<!-- concise-ignore-file -->\n${DELVE}`],
  ["a file over 256 KB is skipped", "big.md", `${DELVE}${"Plain filler text.\n".repeat(15_000)}`],
  ["concise-ignore on the line keeps it", "kept.md", "We delve into it. concise-ignore\n"],
]) {
  const dir = repo({}, committed);
  write(dir, file, text);
  assertEmpty(name, hook(event(dir, "python gen.py")));
}

{
  const dir = repo();
  write(dir, "a.js", '// We delve into it.\nconst note = "We delve into it.";\n');
  const result = hook(event(dir, "node scripts/gen.mjs"));
  includes("a comment in a .js file is reported", result, "1 match at line 1:");
  includes("a string in code is not prose", result, "[concise] 1 AI writing pattern in");
}

{
  const entries = [{ id: "no-foo", match: "exact", value: "fooBar", fix: "use bazQux" }];
  const dir = repo({ features: { emDash: { enabled: true }, dictionary: { enabled: true, entries } } });
  write(dir, "notes.md", "Call fooBar here.\nShip it — fast.\n");
  const result = hook(event(dir, "python gen.py"));
  includes("a dictionary entry is reported", result, "[concise:dictionary:no-foo] 1 match at line 1:");
  includes("an em dash is reported", result, "[concise:emDash] 1 em dash at line 2:");
}

{
  const dir = repo();
  write(dir, "notes.md", DELVE);
  assertBlocked("a PowerShell command is checked", hook(event(dir, "Set-Content notes.md 'We delve into it.'", { tool_name: "PowerShell" })));
  assertEmpty("a non-shell tool is ignored", hook(event(dir, "python gen.py", { tool_name: "Write" })));
  assertEmpty("a command that is not a string is ignored", hook(event(dir, null)));
}

{
  const dir = repo({ bypass: { phrases: ["skip-concise"] } });
  write(dir, "notes.md", DELVE);
  const result = hook(event(dir, "python gen.py # skip-concise"));
  check("a bypass phrase allows the call", !result.decision && reasonOf(result).includes('Allowed by bypass phrase "skip-concise"'), result);
}

{
  const dir = repo({ softFail: true });
  write(dir, "notes.md", DELVE);
  const result = hook(event(dir, "python gen.py"));
  const context = result.hookSpecificOutput?.additionalContext || "";
  check("soft fail drops the block", !result.decision, result);
  check("soft fail keeps the report for the model", result.hookSpecificOutput?.hookEventName === "PostToolUse" && context.includes("soft-fail") && context.includes("[concise:vocabulary]"), result);
}

{
  const dir = repo();
  for (let i = 0; i < 22; i += 1) write(dir, `n${String(i).padStart(2, "0")}.md`, DELVE);
  const named = reasonOf(hook(event(dir, "python gen.py"))).match(/^\[concise\] 1 AI writing pattern in .*\.md\.$/gm) || [];
  check("the scan stops at 20 files", named.length === 20, named.length);
}

{
  const big = Array.from({ length: 60_000 }, (_, i) => `line ${i} of plain filler text`).join("\n");
  const dir = repo({}, { "gone.md": "Plain text.\n", "big.md": big });
  unlinkSync(join(dir, "gone.md"));
  write(dir, "big.md", DELVE);
  const path = write(dir, "notes.md", DELVE);
  const result = hook(event(dir, "python gen.py && gh pr create --body-file missing.md"));
  includes("a deleted file and a missing body file do not stop the scan", result, path);
  lacks("a tracked file with a diff too big to read is skipped", result, join(dir, "big.md"));
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
