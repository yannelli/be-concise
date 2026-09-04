#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CHECK_EDIT, CHECK_BASH, CHECK_REPLY, run, ok, bad, summary, assertDenied, assertAllowed } from "./lib.mjs";
import { setup, cleanup, dashOn, aiOn, writeEvent, bashEvent, stopEvent, transcript, reasonOf, assertEmpty } from "./features-lib.mjs";

const LONG_COMMENT = "// line 1\n// line 2\n// line 3\n// line 4\n// line 5\n";
const BIG_FILE = `${"const x = 1;\n".repeat(320)}`;
const VERBOSE_BODY = "This PR does a thing. It also does another thing. It changes the way we do it. And more.";
const prCommand = (body) => `gh pr create --title "t" --body "${body}"`;
const DASH_LINE = "Ship it — fast.\n";

function has(name, text, needle) {
  if (String(text).includes(needle)) return ok(name);
  bad(name, `expected ${JSON.stringify(needle)} in ${JSON.stringify(String(text)).slice(0, 300)}`);
}

function lacks(name, text, needle) {
  if (!String(text).includes(needle)) return ok(name);
  bad(name, `did not expect ${JSON.stringify(needle)} in ${JSON.stringify(String(text)).slice(0, 300)}`);
}

console.log("\nwiring (checks, soft fail, allow list, bypass, logging)");

{
  const c = setup({ checks: { comments: false } });
  assertAllowed("checks.comments off allows a 5-line comment", run(CHECK_EDIT, writeEvent(c, "a.ts", LONG_COMMENT)));
  const on = setup({});
  assertDenied("the comment check still denies by default", run(CHECK_EDIT, writeEvent(on, "a.ts", LONG_COMMENT)));
}

{
  const c = setup({ checks: { fileSize: false } });
  assertAllowed("checks.fileSize off allows a 320-line write", run(CHECK_EDIT, writeEvent(c, "big.ts", BIG_FILE)));
  const on = setup({});
  assertDenied("the file length check still denies by default", run(CHECK_EDIT, writeEvent(on, "big.ts", BIG_FILE)));
}

{
  const c = setup({ checks: { prBody: false } });
  assertAllowed("checks.prBody off allows a verbose PR body", run(CHECK_BASH, bashEvent(c, prCommand(VERBOSE_BODY))));
  const on = setup({});
  assertDenied("the PR body check still denies by default", run(CHECK_BASH, bashEvent(on, prCommand(VERBOSE_BODY))));
}

{
  const c = setup(dashOn());
  const path = transcript(c, "t.jsonl", DASH_LINE);
  assertEmpty("BEC_DISABLE_STOP_HOOK prints {}", run(CHECK_REPLY, stopEvent(c, path), { BEC_DISABLE_STOP_HOOK: "1" }));
  const blocked = run(CHECK_REPLY, stopEvent(c, path));
  has("the stop hook still blocks without the variable", JSON.stringify(blocked), "block");
}

{
  const c = setup({});
  const result = run(CHECK_EDIT, writeEvent(c, "a.ts", LONG_COMMENT), { BEC_HOOK_SOFT_FAIL: "1" });
  assertAllowed("BEC_HOOK_SOFT_FAIL turns a deny into an allow", result);
  has("the soft-fail flag reaches the user", result.systemMessage, "[concise] soft-fail:");
  has("the soft-fail flag reaches the model", result.hookSpecificOutput?.additionalContext || "", "soft-fail:");
  has("the soft-fail text keeps the reason", result.systemMessage, "limit 2");
}

{
  const base = setup(dashOn());
  assertDenied("an em dash denies without an allow list", run(CHECK_EDIT, writeEvent(base, "d.md", DASH_LINE)));

  const phrases = setup({ ...dashOn(), allowList: { phrases: ["ship it"] } });
  assertAllowed("allowList.phrases drops the finding", run(CHECK_EDIT, writeEvent(phrases, "d.md", DASH_LINE)));

  const patterns = setup({ ...dashOn(), allowList: { patterns: ["^ship\\s+it\\b"] } });
  assertAllowed("allowList.patterns drops the finding", run(CHECK_EDIT, writeEvent(patterns, "d.md", DASH_LINE)));

  const other = setup({ ...dashOn(), allowList: { phrases: ["unrelated"] } });
  assertDenied("an unrelated allow entry keeps the finding", run(CHECK_EDIT, writeEvent(other, "d.md", DASH_LINE)));
}

{
  const c = setup({ bypass: { phrases: ["hotfix"] } });
  const content = `// hotfix\n// line 2\n// line 3\n// line 4\n// line 5\n`;
  const result = run(CHECK_EDIT, writeEvent(c, "b.ts", content));
  assertAllowed("bypass.phrases allows a write that would be denied", result);
  has("the bypass flag names the phrase", result.systemMessage, '[concise] Allowed by bypass phrase "hotfix"');
  has("the bypass flag reaches the model", result.hookSpecificOutput?.additionalContext || "", "bypass phrase");
}

{
  const c = setup(dashOn());
  assertAllowed("styleIgnoreGlobs skips .claude for style", run(CHECK_EDIT, writeEvent(c, ".claude/notes.md", DASH_LINE)));
  const denied = run(CHECK_EDIT, writeEvent(c, ".claude/hook.js", LONG_COMMENT));
  assertDenied("the comment check still applies under .claude", denied);
}

{
  const c = setup({});
  const path = join(c.dir, "logs", "concise.log");
  const result = run(CHECK_EDIT, writeEvent(c, "a.ts", LONG_COMMENT), { BEC_LOG_ENABLED: "1", BEC_LOG_PATH: path });
  assertDenied("the logged call is still denied", result);
  const line = readFileSync(path, "utf8").trim().split("\n").pop();
  const record = JSON.parse(line);
  if (record.decision === "deny") ok("the log record holds the deny");
  else bad("the log record holds the deny", `got ${line}`);
  if (record.hook === "check-edit" && record.tool === "Write") ok("the log record names the hook and the tool");
  else bad("the log record names the hook and the tool", `got ${line}`);
}

{
  const c = setup({});
  const env = { BEC_CONFIG_JSON: "{not json" };
  const first = run(CHECK_EDIT, writeEvent(c, "clean.ts", "export const x = 1;\n"), env);
  has("a bad BEC_CONFIG_JSON is reported once", first.systemMessage || "", "[concise] config ignored: BEC_CONFIG_JSON");
  const second = run(CHECK_EDIT, writeEvent(c, "clean.ts", "export const y = 2;\n"), env);
  lacks("the same session is not warned twice", second.systemMessage || "", "config ignored");
}

{
  const c = setup(dashOn({ mode: "deny" }));
  const path = transcript(c, "t2.jsonl", DASH_LINE);
  const result = run(CHECK_REPLY, stopEvent(c, path), { BEC_HOOK_SOFT_FAIL: "1" });
  if (result.decision) bad("soft fail turns a Stop block into a message", `got ${JSON.stringify(result)}`);
  else ok("soft fail turns a Stop block into a message");
  has("the Stop soft-fail text carries the finding", reasonOf(result), "soft-fail:");
}

{
  const c = setup({ ...dashOn(), allowList: { patterns: ["(unclosed"] } });
  const first = run(CHECK_EDIT, writeEvent(c, "d.md", DASH_LINE));
  has("an allow list regex that fails to compile is reported", first.systemMessage || "", "allow list pattern");
  assertDenied("the finding survives the broken pattern", first);
  const second = run(CHECK_EDIT, writeEvent(c, "d.md", DASH_LINE));
  lacks("the broken pattern is reported once", second.systemMessage || "", "allow list pattern");
}

{
  const c = setup({ ...dashOn(), allowList: { patterns: ["(unclosed"] } });
  const result = run(CHECK_EDIT, writeEvent(c, "d.md", DASH_LINE), { BEC_HOOK_SOFT_FAIL: "1" });
  assertAllowed("soft fail allows the denied write", result);
  has("soft fail keeps the warning that rode on the deny", result.systemMessage || "", "allow list pattern");
  has("soft fail still carries its own text", result.systemMessage || "", "soft-fail:");
}

{
  const c = setup(dashOn({ mode: "deny" }));
  const path = transcript(c, "t3.jsonl", DASH_LINE);
  const result = run(CHECK_REPLY, stopEvent(c, path), { BEC_HOOK_SOFT_FAIL: "1" });
  lacks("the Stop soft-fail text drops the held notice", result.systemMessage || "", "reply held");
}

{
  const c = setup(aiOn());
  const path = join(c.dir, "logs", "commit.log");
  const command = `git commit -m "$(cat <<'EOF'\nfix: parser\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF\n)"`;
  const env = { BEC_LOG_ENABLED: "1", BEC_LOG_PATH: path };
  assertDenied("a commit trailer is denied", run(CHECK_BASH, bashEvent(c, command), env));
  const record = JSON.parse(readFileSync(path, "utf8").trim().split("\n").pop());
  has("the log key names the scan that decided", record.key, "style:commit:");
  if (record.scope === "commit") ok("the log scope is the deciding scan's scope");
  else bad("the log scope is the deciding scan's scope", `got ${record.scope}`);
}

{
  const c = setup(aiOn());
  const command = 'git commit --author="Claude Code <noreply@anthropic.com>" -m "fix parser concise-ignore"';
  assertEmpty("concise-ignore in the command skips the command scan", run(CHECK_BASH, bashEvent(c, command)));
  const plain = 'git commit --author="Claude Code <noreply@anthropic.com>" -m "fix parser"';
  assertDenied("the same command without the marker is denied", run(CHECK_BASH, bashEvent(c, plain)));
}

cleanup();

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
